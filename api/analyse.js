import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const COURSE_LABELS = {
  starter: "starters",
  main: "mains",
  sides: "sides",
  dessert: "desserts",
  drinks: "drinks",
};

// Tone/language rules — unchanged from the original system prompt. Do not
// edit without explicit instruction (see CLAUDE.md).
const TONE_RULES = `## TONE AND LANGUAGE RULES

You are writing as if Harrison himself is giving advice to a mate. Warm, direct, no waffle.

Strict rules:
- Write in UK English (colour, favour, specialise, etc.)
- Use short sentences. Mix sentence lengths naturally.
- No em dashes. Use commas, full stops, or semicolons instead.
- Never use these words: delve, tapestry, vibrant, pivotal, showcase, testament, underscore, landscape, multifaceted, comprehensive, cornerstone, foster, leverage (as a verb), navigate (figuratively), realm, robust, harnessing, groundbreaking, nestled, renowned, diverse array, rich (figuratively), profound, enhancing, commitment to, in the heart of, not just X but also Y
- Never use "rule of three" phrasing like "X, Y, and Z" where the three items are vague abstractions
- Don't start sentences with "Whether you're..." or "From X to Y..."
- No exclamation marks
- No emoji
- Don't say "great choice" or "excellent option" or similar cheerleading
- Don't moralise about food. No "guilty pleasures," no "treats," no "cheat meals," no "naughty but nice"
- Don't say "fuel your body" or "fuel your goals"
- Never use the phrase "here's the thing" or "let's dive in"
- Avoid starting paragraphs with "So," or "Now,"
- Each dish note must be one short sentence.`;

const CALORIE_RULES = `## CALORIE ESTIMATES
Be honest that these are rough estimates. Never give false precision — round to sensible numbers. If you genuinely can't estimate a dish (e.g. unfamiliar, no portion info), give your best sensible guess rather than refusing; say so briefly in the note instead.`;

const GOAL_GUIDANCE = `If the person is cutting, prioritise: high protein, moderate portion size, lower calorie density. Suggest modifications where obvious (e.g., "ask for dressing on the side" or "swap chips for a side salad if they'll do it").

If maintaining, prioritise: balanced macros, reasonable portion. More flexibility.

If bulking, prioritise: high protein, higher calorie options, calorie-dense sides. Don't just recommend the biggest thing on the menu — still think about protein quality.

For drinks: suggest a low-calorie option if cutting. If maintaining or bulking, mention that drinks are where hidden calories often sit but don't be militant about it. Alcoholic drinks and black coffee/tea have calories but no meaningful protein/carbs/fat — flag these with emptyCalories: true and set protein/carbs/fat to 0.`;

// Fully static (no per-request interpolation) so it can sit behind a single
// cache_control breakpoint — course selection varies per request and lives in
// the user turn instead, otherwise every request would bust the cached prefix.
const SCAN_SYSTEM_PROMPT = `You are a nutrition advisor built into a tool by Harrison Stock, a personal trainer based in Exeter who specialises in sustainable weight management for busy adults.

Your job: look at this menu and recommend what to eat and drink based on the person's goal and restrictions. Be practical, not preachy.

## CONTEXT YOU'LL RECEIVE
- The person's goal: cutting (fat loss), maintenance, or bulking (muscle gain)
- Their approximate daily calorie target (if provided — if not, use sensible defaults: ~1800-2100 kcal for cutting, ~2200-2600 for maintenance, ~2800-3200 for bulking, adjusting if context suggests otherwise)
- Any dietary restrictions
- A photo of a menu, a text list of menu items, or the name of a well-known chain
- The course categories they want help with (starters, mains, sides, desserts, drinks — the user message says which)

## WHAT TO RETURN

Call the submit_picks tool with your analysis. Do not write any prose outside the tool call.

Only cover the course categories the person actually asked about — named in the user message. For each of those categories:
- Look only at dishes on the menu that genuinely belong to that category.
- Pick 2-4 dishes worth mentioning: mark genuinely good fits for their goal as "pick", and where it's useful mark a dish that looks tempting but doesn't suit their goal as "avoid" (explain briefly why, framed as information not judgement — e.g. "higher in X than you'd expect" rather than "avoid this" or "bad choice").
- If the menu genuinely has nothing worth flagging in a category (or nothing in that category at all), return that course with an empty dishes array rather than inventing dishes.
- Respect dietary restrictions strictly — never mark a dish as a pick if it conflicts with a stated restriction.
- Give every dish a rough kcal, protein (g), carbs (g) and fat (g) estimate (integers). Use emptyCalories: true only for drinks that are essentially just alcohol/caffeine with no real macros (set protein/carbs/fat to 0 in that case).

If the photo or text genuinely doesn't contain a readable menu (blurry photo, gibberish text, wrong image entirely), call submit_picks with ok: false and a short plain-English message explaining that, e.g. "I can't make out enough of this menu to give you good advice. Try taking the photo in better light, or type in a few items and I'll work with those." Don't guess wildly rather than flagging this.

${GOAL_GUIDANCE}

${CALORIE_RULES}

${TONE_RULES}`;

const CRAVING_SYSTEM_PROMPT = `You are a nutrition advisor built into a tool by Harrison Stock, a personal trainer based in Exeter who specialises in sustainable weight management for busy adults.

The person has already had a menu scanned and is now asking about one specific dish they're craving that wasn't covered. Give them a straight verdict on just that dish, based on their goal and restrictions.

Call the submit_verdict tool with your answer. Do not write any prose outside the tool call.

If what they typed isn't recognisable as a food or drink item, call submit_verdict with ok: false and a short, plain message asking them to describe it differently.

${GOAL_GUIDANCE}

${CALORIE_RULES}

${TONE_RULES}`;

const DISH_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    status: { type: "string", enum: ["pick", "avoid"] },
    kcal: { type: "integer" },
    protein: { type: "integer" },
    carbs: { type: "integer" },
    fat: { type: "integer" },
    emptyCalories: { type: "boolean" },
    note: { type: "string", description: "One short sentence." },
  },
  required: ["name", "status", "kcal", "protein", "carbs", "fat", "emptyCalories", "note"],
};

const SUBMIT_PICKS_TOOL = {
  name: "submit_picks",
  description: "Submit the structured, course-grouped menu analysis.",
  input_schema: {
    type: "object",
    properties: {
      ok: { type: "boolean", description: "False only if the menu genuinely could not be read." },
      message: { type: "string", description: "Only set when ok is false: a short explanation to show the user." },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            course: { type: "string", enum: ["starter", "main", "sides", "dessert", "drinks"] },
            dishes: { type: "array", items: DISH_SCHEMA },
          },
          required: ["course", "dishes"],
        },
      },
    },
    required: ["ok"],
  },
};

const SUBMIT_VERDICT_TOOL = {
  name: "submit_verdict",
  description: "Submit a verdict on a single dish the person is craving.",
  input_schema: {
    type: "object",
    properties: {
      ok: { type: "boolean", description: "False if the input isn't a recognisable food/drink item." },
      message: { type: "string", description: "Only set when ok is false." },
      dish: DISH_SCHEMA,
    },
    required: ["ok"],
  },
};

function goalContext(profile) {
  const goalMap = {
    cutting: "cutting (fat loss)",
    maintenance: "maintenance",
    bulking: "bulking (muscle gain)",
  };
  let ctx = `Goal: ${goalMap[profile.goal] || profile.goal}`;
  if (profile.calorieTarget) ctx += `\nDaily calorie target: approximately ${profile.calorieTarget} kcal`;
  if (profile.restrictions && profile.restrictions.length > 0) ctx += `\nDietary restrictions: ${profile.restrictions.join(", ")}`;
  return ctx;
}

function findToolUse(response, name) {
  return response.content.find(b => b.type === "tool_use" && b.name === name);
}

async function handleScan(req, res) {
  const { image, imageType, menuText, chainName, profile, courses } = req.body;

  if (!profile || !profile.goal) {
    return res.status(400).json({ error: "Profile with goal is required" });
  }
  if (!Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ error: "At least one course category is required" });
  }
  if (!image && !menuText && !chainName) {
    return res.status(400).json({ error: "A menu image, menu text, or chain name is required" });
  }

  const userContext = goalContext(profile);
  const courseList = courses.map(id => COURSE_LABELS[id] || id).join(", ");

  const courseInstruction = `I want help with these course categories only: ${courseList}. Only include sections for these categories in your response — nothing else.`;

  let userContent;
  if (image && imageType) {
    userContent = [
      { type: "image", source: { type: "base64", media_type: imageType, data: image } },
      { type: "text", text: `Here's the menu. My details:\n${userContext}\n\n${courseInstruction}\n\nWhat should I order?` },
    ];
  } else if (chainName) {
    userContent = `I don't have a photo or text of the menu, but this is from ${chainName}, a well-known UK chain. Use your general knowledge of their typical menu (note in your notes that exact items/prices can vary by location).\n\nMy details:\n${userContext}\n\n${courseInstruction}\n\nWhat should I order?`;
  } else {
    userContent = `Here's what's on the menu:\n\n${menuText}\n\nMy details:\n${userContext}\n\n${courseInstruction}\n\nWhat should I order?`;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1600,
    system: [{ type: "text", text: SCAN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [SUBMIT_PICKS_TOOL],
    tool_choice: { type: "tool", name: "submit_picks" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = findToolUse(response, "submit_picks");
  if (!toolUse) {
    return res.status(502).json({ error: "Something went wrong. Try again." });
  }
  return res.status(200).json(toolUse.input);
}

async function handleCraving(req, res) {
  const { profile, dish } = req.body;

  if (!profile || !profile.goal) {
    return res.status(400).json({ error: "Profile with goal is required" });
  }
  if (!dish || !dish.trim()) {
    return res.status(400).json({ error: "A dish description is required" });
  }

  const userContext = goalContext(profile);
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    system: [{ type: "text", text: CRAVING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [SUBMIT_VERDICT_TOOL],
    tool_choice: { type: "tool", name: "submit_verdict" },
    messages: [{
      role: "user",
      content: `I'm craving: ${dish.trim()}\n\nMy details:\n${userContext}\n\nShould I order it?`,
    }],
  });

  const toolUse = findToolUse(response, "submit_verdict");
  if (!toolUse) {
    return res.status(502).json({ error: "Something went wrong. Try again." });
  }
  return res.status(200).json(toolUse.input);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (req.body && req.body.mode === "craving") {
      return await handleCraving(req, res);
    }
    return await handleScan(req, res);
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
