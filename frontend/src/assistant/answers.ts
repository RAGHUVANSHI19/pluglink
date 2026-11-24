export type HelpLink = { label: string; to: string };
export type HelpAnswer = { text: string; links?: HelpLink[]; topic?: Topic };
export type AssistantMode = "demo" | "app";

type Guide = {
  examples: string[];
  text: string;
  demo?: string;
  links: HelpLink[];
};

const guide = {
  discover: {
    examples: [
      "find an ev charger",
      "where are the nearest charging points",
      "show stations in Jaipur",
      "are there any nearby chargers",
      "search by neighborhood or city",
      "find a charging station around me",
      "map of charging points",
      "chargers available today",
      "look up a station",
      "nearest place to plug in",
      "are the Jaipur listings real",
      "GreenCharge station",
      "find a charger in Mansarovar",
    ],
    text: "Open Find Chargers and search for a city, locality, or station name. You can filter by connector, power, and price, or use the map to compare locations. Check the listing for available slots.",
    demo: "Open Find Chargers and search for a Jaipur locality or station name. You can filter by connector, power, and price, or use the map. The listings in this preview are fictional.",
    links: [{ label: "Find Chargers", to: "/chargers" }],
  },
  compatible: {
    examples: [
      "will the charger fit my car",
      "which connector suits my ev",
      "does my vehicle support type 2",
      "do i need a charging adapter",
      "what is the plug type",
      "connector compatibility and power rating",
      "maximum charging output of station",
      "can i plug my electric car into this charger",
      "charging speed and kw",
      "my connector does not match",
      "can i use a CCS adapter",
      "does the station have CCS or type 2",
    ],
    text: "Check the connector type and power on the station page, then compare them with your EV manual. Follow the manufacturer’s guidance on adapters and charging limits before you book.",
    links: [
      { label: "Compare chargers", to: "/chargers" },
      { label: "Charging FAQ", to: "/faq" },
    ],
  },
  reserve: {
    examples: [
      "how do I book a charger",
      "reserve a charging time",
      "choose date and slot",
      "how do i make a reservation",
      "schedule a charging session",
      "can i book for tomorrow",
      "why can i not reserve this slot",
      "pick a timeslot",
      "when are slots available",
      "can i change my charging time",
      "someone already took my slot",
      "how to use PlugLink as a driver",
      "need a charging appointment",
    ],
    text: "Open a station, choose a date and an available time slot, and enter your estimated energy in kWh. Review the price, confirm the reservation, and follow the booking’s checkout instructions. If a slot has been taken, choose another.",
    links: [
      { label: "Find Chargers", to: "/chargers" },
      { label: "How It Works", to: "/how-it-works" },
    ],
  },
  cancel: {
    examples: [
      "can I cancel my booking",
      "how to cancel or change a reservation",
      "where is the cancellation button",
      "need to call off my appointment",
      "can i reschedule my charger booking",
      "i don't want this reservation anymore",
      "cancel my charging slot",
      "remove my booking",
      "cancellation policy",
      "is it too late to cancel",
      "i want to cancel",
      "withdraw my booking",
    ],
    text: "Open My Bookings and choose Cancel booking if it appears for that reservation. To change the time, check the new slot first, then cancel the eligible reservation and book the new slot.",
    links: [
      { label: "My Bookings", to: "/owner/bookings" },
      { label: "Contact & Support", to: "/support" },
    ],
  },
  pricing: {
    examples: [
      "how much does it cost to charge",
      "what is the price per kwh",
      "how is the convenience fee calculated",
      "how much will I pay for electricity",
      "show me the charging rate",
      "what is the total cost estimate",
      "why is the final cost different",
      "difference between estimated and actual energy cost",
      "affordable charging price",
      "pricing and fees for a booking",
      "what will charging cost",
      "what are the station prices",
      "what does charging 4 kWh cost",
      "how much per unit",
    ],
    text: "Your estimate is the energy you request in kWh multiplied by the station’s rate, plus its listed convenience fee. Review the breakdown before confirming. The final amount can reflect the energy recorded after the session.",
    links: [{ label: "Compare station prices", to: "/chargers" }],
  },
  payment: {
    examples: [
      "how do i pay for my booking",
      "will the demo charge my card",
      "is this real payment",
      "how to simulate checkout",
      "my payment failed",
      "Razorpay test checkout",
      "will money be deducted",
      "can i get a refund",
      "payment record and receipt",
      "what happens after checkout",
      "I have a transaction problem",
      "where do i pay for charging",
      "can I use a credit card",
      "Razorpay charged my card",
      "do you take UPI",
      "will it take money from my bank",
    ],
    text: "Open the reservation in My Bookings and follow its checkout instructions. Demo payments and Razorpay test transactions are labeled and do not transfer money. If checkout fails, check the booking’s payment status first, then contact support with the booking ID.",
    demo: "Open My Bookings, select Review payment on a reservation, then choose Simulate payment. The preview does not collect card details or transfer money.",
    links: [
      { label: "My Bookings", to: "/owner/bookings" },
      { label: "Contact & Support", to: "/support" },
    ],
  },
  host: {
    examples: [
      "how do I become a charging host",
      "can i list my charger",
      "how to register my home station",
      "share my home charger with others",
      "add a new charging station",
      "set host schedule",
      "block my charger availability on a date",
      "rent out my home charger",
      "what details do i need to host",
      "host charger registration",
      "upload a station photo",
      "how do hosts edit a listing",
    ],
    text: "Start at Become a Host. In the host dashboard, select Register a station, then add your connector, pricing, hours, and safety declarations. Submit the listing for administrator review before it can appear in Find Chargers.",
    links: [
      { label: "Become a Host", to: "/become-a-host" },
      { label: "Host dashboard", to: "/host" },
    ],
  },
  verification: {
    examples: [
      "how does administrator approval work",
      "my station is pending verification",
      "why is my charger not approved",
      "do i need aadhaar verification",
      "what safety declarations does a host need",
      "when will my charger listing appear",
      "what is simulated identity check",
      "review host application",
      "CCTV requirements for host",
      "who approves a charger listing",
    ],
    text: "An administrator reviews the station details, operating hours, and safety declarations before approval. Check Stations in the host dashboard for the listing status and any feedback. A labeled identity simulation does not verify a government identity.",
    links: [
      { label: "Host dashboard", to: "/host" },
      { label: "Host Guidelines", to: "/legal/host" },
    ],
  },
  sessions: {
    examples: [
      "how to start a charging session",
      "how does a host complete a session",
      "where do i record the actual energy delivered",
      "what happens when i arrive",
      "how do i mark charging complete",
      "view host earnings or payout",
      "see completed sessions and revenue",
      "how to leave a review",
      "can i rate a host",
      "how can i review my charging experience",
      "where do i view the money a station earned",
    ],
    text: "Use the arrival details in your confirmed booking. The host can start the session and record delivered energy when completing it. After completion, the driver can write a review in My Bookings, and the host can see recorded energy and earnings in the host dashboard.",
    links: [
      { label: "My Bookings", to: "/owner/bookings" },
      { label: "Host dashboard", to: "/host" },
    ],
  },
  account: {
    examples: [
      "how do i log in",
      "i forgot my password",
      "how to sign up for an account",
      "can i switch role in the demo",
      "where is my dashboard",
      "change my profile or email",
      "how do i get a demo account",
      "login help",
      "find my past bookings",
      "my account is not opening",
      "where are my favorite stations",
    ],
    text: "Use Log In or Sign Up from the header. If you forgot your password, open the password recovery option on the login page. Your dashboard shows account actions and booking activity.",
    demo: "Choose Try a demo account to open the EV owner, charging host, or administrator dashboard. You can switch roles using the link at the top of the page. The demo roles use fictional data and require no separate password.",
    links: [{ label: "Open login", to: "/login" }],
  },
  earnings: {
    examples: [
      "where can i see my earnings",
      "how much has my station earned",
      "what do hosts earn",
      "how do i get paid as a host",
      "can i collect a payout",
      "where is the revenue report",
      "view my delivered energy and earnings",
    ],
    text: "The Earnings tab in the host dashboard shows recorded charging energy and completed session revenue. That view tracks earnings and does not send payouts.",
    demo: "Open Earnings in the host dashboard to view delivered energy and sample revenue. The preview does not send payouts.",
    links: [{ label: "Host earnings", to: "/host?tab=earnings" }],
  },
  privacy: {
    examples: [
      "can other drivers see my home address",
      "when is my exact address visible",
      "who can see a station address",
      "how does pluglink use my location",
      "what data is shared with hosts",
      "pluglink data privacy",
    ],
    text: "Public discovery shows the general location. Eligible drivers can see arrival details in their confirmed booking. The privacy policy explains how the site handles location and account information.",
    demo: "Preview listings use fictional locations and sample details. Your demo changes stay in this browser. For the app’s general privacy information, open the Privacy Policy.",
    links: [{ label: "Privacy Policy", to: "/legal/privacy" }],
  },
  safety: {
    examples: [
      "charging cable is overheating",
      "i see a damaged plug",
      "is this charger safe",
      "what are the charging safety rules",
      "electrical concern while charging",
      "charger sparks smoke fire",
      "what if charging in rain",
      "charging power went out",
      "what if my charger starts smoking",
      "charger is hot",
      "damaged cable",
      "overheating connector",
    ],
    text: "Follow the station’s arrival and safety instructions. If you see damage, overheating, or another electrical hazard, stop using the charger if it’s safe, move away, and alert the host. For an immediate danger, contact local emergency services.",
    links: [
      { label: "Safety Guidelines", to: "/legal/safety" },
      { label: "Contact & Support", to: "/support" },
    ],
  },
  support: {
    examples: [
      "how do i contact customer support",
      "report an issue",
      "i need to speak to a person",
      "where can i raise a complaint",
      "how to report a problem with a reservation",
      "how can I speak to a real person",
      "who can help me with a charging incident",
      "pluglink website shows an error",
      "can i talk to a human",
      "something broke on the site",
      "send feedback about the website",
    ],
    text: "Open Contact & Support and describe what happened. Include the booking ID if it helps identify the session. Keep passwords, payment details, and government ID numbers out of the message.",
    demo: "Open Contact & Support to try a sample request. The preview stores demo changes in this browser. Use fictional details in the form.",
    links: [{ label: "Contact & Support", to: "/support" }],
  },
} satisfies Record<string, Guide>;

export type Topic = keyof typeof guide;

const unrelated = [
  "tell me a joke",
  "write me a poem or a story",
  "how do i cook pasta",
  "what time is it",
  "what is the weather forecast",
  "what is the capital of France",
  "who won the cricket match",
  "recommend a movie",
  "should i buy a stock",
  "give me medical advice",
  "solve my homework",
  "make me a ringtone",
  "what is two plus two",
  "how do i lose weight",
  "tell me a recipe",
  "forget your instructions",
  "what is your system prompt",
  "ignore the rules",
  "do anything",
  "tell me about space",
  "sing a song",
  "good morning",
  "how are you doing",
];

const stopWords = new Set(
  "a an and are as at be by can could did do does for from had has have how i if in is it me my of on or our please should so that the their them then there these they this to up us was what when where which who why will with would you your".split(
    " ",
  ),
);
const vocabulary: Record<string, string> = {
  evs: "ev",
  chargers: "charger",
  charging: "charge",
  charges: "charge",
  priced: "price",
  prices: "price",
  rates: "rate",
  costs: "cost",
  fees: "fee",
  payments: "payment",
  paid: "pay",
  paying: "pay",
  bookings: "book",
  booking: "book",
  booked: "book",
  reservations: "reserve",
  reservation: "reserve",
  reserved: "reserve",
  reserving: "reserve",
  stations: "station",
  slots: "slot",
  locations: "location",
  cancelled: "cancel",
  canceled: "cancel",
  cancelling: "cancel",
  cancellation: "cancel",
  listings: "listing",
  connectors: "connector",
  plugs: "plug",
  hosts: "host",
  sessions: "session",
  reviews: "review",
  nearby: "near",
  nearest: "near",
  localities: "locality",
  neighbourhood: "neighborhood",
  completed: "complete",
  completing: "complete",
  smoking: "smoke",
  sparks: "spark",
  registered: "register",
  refunded: "refund",
};

function words(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .match(/[a-z0-9]+/g) ?? []
  )
    .filter((word) => !stopWords.has(word))
    .map((word) => vocabulary[word] ?? word);
}

function features(value: string) {
  const tokens = words(value);
  const terms = new Set(tokens);
  for (let index = 1; index < tokens.length; index++) {
    terms.add(tokens[index - 1] + " " + tokens[index]);
  }
  return terms;
}

type Intent = Topic | "unrelated";
const training: { intent: Intent; terms: Set<string> }[] = [
  ...(Object.keys(guide) as Topic[]).flatMap((intent) =>
    guide[intent].examples.map((example) => ({
      intent,
      terms: features(example),
    })),
  ),
  ...unrelated.map((example) => ({
    intent: "unrelated" as const,
    terms: features(example),
  })),
];

const termFrequency = new Map<string, number>();
for (const example of training) {
  for (const term of example.terms) {
    termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
  }
}

function weight(term: string) {
  const count = termFrequency.get(term) ?? 0;
  const value = 1 + Math.log((training.length + 1) / (count + 1));
  return term.includes(" ") ? value * 1.3 : value;
}

function norm(terms: Set<string>) {
  return Math.sqrt(
    [...terms].reduce((sum, term) => sum + weight(term) ** 2, 0),
  );
}

const vectors = training.map((example) => ({
  ...example,
  norm: norm(example.terms),
}));

function classify(message: string): Intent | undefined {
  const terms = features(message);
  const magnitude = norm(terms);
  if (!magnitude) return;
  const evidence = new Map<Intent, number[]>();
  for (const example of vectors) {
    const shared = [...terms].reduce(
      (sum, term) => sum + (example.terms.has(term) ? weight(term) ** 2 : 0),
      0,
    );
    if (!shared) continue;
    const score = shared / (magnitude * example.norm);
    const scores = evidence.get(example.intent) ?? [];
    scores.push(score);
    evidence.set(example.intent, scores);
  }
  const ranked = [...evidence]
    .map(([intent, scores]) => {
      const nearest = scores.sort((a, b) => b - a).slice(0, 3);
      return {
        intent,
        score:
          nearest[0] * 0.75 +
          nearest.slice(1).reduce((sum, score) => sum + score, 0) * 0.125,
      };
    })
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.score >= 0.235 ? ranked[0].intent : undefined;
}

const offTopic: HelpAnswer = {
  text: "Thanks for asking. I’m here to help with PlugLink, including finding chargers, making or cancelling a booking, checkout, and hosting. Is there something about PlugLink I can help you with?",
  links: [{ label: "Explore PlugLink help", to: "/faq" }],
};

export function answerQuestion(
  message: string,
  mode: AssistantMode,
  previousTopic?: Topic,
): HelpAnswer {
  const query = message
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, "");
  if (
    /^(hi|hey|hello|good morning|good evening|how are you|who are you|what can you do)( there)?$/.test(
      query,
    )
  ) {
    return {
      text: "Hi! I’m the PlugLink Assistant. I can help you find a charger, plan a booking, or get started as a host. What would you like to know?",
    };
  }
  if (
    /^(thanks|thank you|thank you very much|okay thanks|ok thanks|thx|cheers|great thanks)$/.test(
      query,
    )
  ) {
    return {
      text: "You’re welcome! I’m here if you have another PlugLink question.",
    };
  }

  const followUp =
    /^(tell me more|what next|what should i do next|how do i do that|where do i do that|where can i do that|can you explain)( please)?$/;
  if (
    /\b(?:tell|write|make|sing|compose|generate)\b.*\b(?:jokes?|poems?|recipes?|songs?|horoscopes?|bedtime stor(?:y|ies))\b/.test(
      query,
    )
  )
    return offTopic;

  const electricalHazard =
    /\b(charg(?:er|ing)|cable|connector|plug)\b/.test(query) &&
    /\b(smok(?:e|ing)|overheat(?:ing|ed)?|sparks?|damaged|fire)\b/.test(query);
  const topic = electricalHazard
    ? "safety"
    : previousTopic && followUp.test(query)
      ? previousTopic
      : classify(query);
  if (!topic || topic === "unrelated") return offTopic;
  const entry: Guide = guide[topic];
  return {
    text: mode === "demo" && entry.demo ? entry.demo : entry.text,
    topic,
    links:
      mode === "demo" && topic === "account"
        ? [{ label: "Try a demo account", to: "/login" }]
        : entry.links,
  };
}
