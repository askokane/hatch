// Curated catalog expansion: art, music, finance, business and soft skills.
//
// WHY THIS IS HAND-WRITTEN AND NOT IMPORTED
//
// ESCO (~13,900 skills) and O*NET are both openly licensed and would have been
// one fetch away. They are the wrong input for this table. Tag overlap is the
// dominant term in the discover ranking (lib/ranking.ts), so near-duplicate rows
// do not merely clutter the picker — they actively split the match signal, and
// two people who both do the same thing score as though they do not. Those
// taxonomies are also written for labour-market statistics ("apply anti-oxidation
// processes"), not for a student describing what they can do.
//
// So the rule here is one row per thing a student would actually claim, with the
// synonyms folded into `aliases` rather than spawning siblings. The catalog is
// user-grown by design (createTagAction); this set is the quality floor, not an
// attempt at completeness.
//
// SLUGS ARE THE IDENTITY and must equal catalogSlug(label) EXACTLY — with the
// accent fold added in migration 20260805140000. They are written out literally
// rather than derived at import time so that what lands in the database is
// reviewable in the diff, and scripts/verify-catalog.ts asserts the two agree.
//
// This is not cosmetic. createTagAction derives the slug from whatever the user
// types, so a row whose slug is not catalogSlug(its own label) is unreachable by
// that path: someone typing "M&A" computes `m-a`, fails to find a row stored
// under `m-and-a`, and creates a second one. That is exactly how the duplicate
// problem this catalog exists to prevent gets reintroduced. Hence `m-a` and
// `a-r` below — ugly as identifiers, but identifiers are never shown to anyone,
// and the label is what the picker renders.
//
// ALIASES ARE NOT FREE. searchTagsAction loads every row with a non-empty
// `aliases` into memory on each keystroke, bounded by TAG_ALIAS_SCAN_MAX. Adding
// ~225 aliased rows here took that set from 99 to ~324, which is why that
// constant was raised. Anything that would push it past the bound needs the
// alias lookup redesigned (an indexed TagAlias table), not the number nudged.
//
// One alias rule learned the hard way: never alias to a short string that means
// something else. "ai" for Adobe Illustrator would hijack every search for
// artificial intelligence; "pm" is both project and product manager. Aliases are
// for unambiguous synonyms only.

export type CatalogTag = {
  slug: string;
  label: string;
  kind: "SKILL" | "INTEREST" | "DOMAIN";
  aliases: string[];
};

// --- ART & DESIGN -----------------------------------------------------------
const ART: CatalogTag[] = [
  { slug: "graphic-design", label: "Graphic Design", kind: "SKILL", aliases: ["graphic design", "graphics"] },
  { slug: "typography", label: "Typography", kind: "SKILL", aliases: ["typography", "type design", "lettering"] },
  { slug: "art-direction", label: "Art Direction", kind: "SKILL", aliases: ["art direction", "art director"] },
  { slug: "creative-direction", label: "Creative Direction", kind: "SKILL", aliases: ["creative direction"] },
  { slug: "visual-identity", label: "Visual Identity", kind: "SKILL", aliases: ["visual identity", "identity design"] },
  { slug: "3d-modeling", label: "3D Modeling", kind: "SKILL", aliases: ["3d modeling", "3d modelling", "modeling"] },
  { slug: "3d-rendering", label: "3D Rendering", kind: "SKILL", aliases: ["3d rendering", "rendering", "vray"] },
  { slug: "animation", label: "Animation", kind: "SKILL", aliases: ["animation", "animator"] },
  { slug: "character-design", label: "Character Design", kind: "SKILL", aliases: ["character design"] },
  { slug: "concept-art", label: "Concept Art", kind: "SKILL", aliases: ["concept art"] },
  { slug: "storyboarding", label: "Storyboarding", kind: "SKILL", aliases: ["storyboarding", "storyboards"] },
  { slug: "drawing", label: "Drawing", kind: "SKILL", aliases: ["drawing", "sketching"] },
  { slug: "painting", label: "Painting", kind: "SKILL", aliases: ["painting"] },
  { slug: "digital-painting", label: "Digital Painting", kind: "SKILL", aliases: ["digital painting"] },
  { slug: "printmaking", label: "Printmaking", kind: "SKILL", aliases: ["printmaking", "screen printing", "risograph"] },
  { slug: "sculpture", label: "Sculpture", kind: "SKILL", aliases: ["sculpture", "sculpting"] },
  { slug: "ceramics", label: "Ceramics", kind: "SKILL", aliases: ["ceramics", "pottery"] },
  { slug: "collage", label: "Collage", kind: "SKILL", aliases: ["collage"] },
  { slug: "comics", label: "Comics", kind: "SKILL", aliases: ["comics", "comic art", "sequential art"] },
  { slug: "mural-art", label: "Mural Art", kind: "SKILL", aliases: ["mural", "murals", "street art"] },
  { slug: "calligraphy", label: "Calligraphy", kind: "SKILL", aliases: ["calligraphy"] },
  { slug: "bookbinding", label: "Bookbinding", kind: "SKILL", aliases: ["bookbinding"] },
  { slug: "color-theory", label: "Color Theory", kind: "SKILL", aliases: ["color theory", "colour theory"] },
  { slug: "photo-editing", label: "Photo Editing", kind: "SKILL", aliases: ["photo editing", "retouching", "lightroom"] },
  { slug: "video-editing", label: "Video Editing", kind: "SKILL", aliases: ["video editing", "video editor"] },
  { slug: "cinematography", label: "Cinematography", kind: "SKILL", aliases: ["cinematography", "camera work"] },
  { slug: "film-production", label: "Film Production", kind: "SKILL", aliases: ["film production", "filmmaking"] },
  { slug: "documentary", label: "Documentary", kind: "SKILL", aliases: ["documentary", "docs filmmaking"] },
  { slug: "fashion-design", label: "Fashion Design", kind: "SKILL", aliases: ["fashion design", "fashion"] },
  { slug: "textile-design", label: "Textile Design", kind: "SKILL", aliases: ["textile design", "textiles"] },
  { slug: "industrial-design", label: "Industrial Design", kind: "SKILL", aliases: ["industrial design"] },
  { slug: "interior-design", label: "Interior Design", kind: "SKILL", aliases: ["interior design"] },
  { slug: "architecture", label: "Architecture", kind: "SKILL", aliases: ["architecture", "architectural design"] },
  { slug: "set-design", label: "Set Design", kind: "SKILL", aliases: ["set design", "scenography"] },
  { slug: "exhibition-design", label: "Exhibition Design", kind: "SKILL", aliases: ["exhibition design"] },
  { slug: "editorial-design", label: "Editorial Design", kind: "SKILL", aliases: ["editorial design", "layout design"] },
  { slug: "packaging-design", label: "Packaging Design", kind: "SKILL", aliases: ["packaging design", "packaging"] },
  { slug: "game-art", label: "Game Art", kind: "SKILL", aliases: ["game art", "game artist"] },
  { slug: "curation", label: "Curation", kind: "SKILL", aliases: ["curation", "curating"] },
  { slug: "photoshop", label: "Photoshop", kind: "SKILL", aliases: ["photoshop", "adobe photoshop"] },
  { slug: "adobe-illustrator", label: "Adobe Illustrator", kind: "SKILL", aliases: ["adobe illustrator"] },
  { slug: "indesign", label: "InDesign", kind: "SKILL", aliases: ["indesign", "adobe indesign"] },
  { slug: "after-effects", label: "After Effects", kind: "SKILL", aliases: ["after effects", "aftereffects"] },
  { slug: "premiere-pro", label: "Premiere Pro", kind: "SKILL", aliases: ["premiere", "premiere pro"] },
  { slug: "davinci-resolve", label: "DaVinci Resolve", kind: "SKILL", aliases: ["davinci", "davinci resolve"] },
  { slug: "blender", label: "Blender", kind: "SKILL", aliases: ["blender"] },
  { slug: "cinema-4d", label: "Cinema 4D", kind: "SKILL", aliases: ["cinema 4d", "c4d"] },
  { slug: "procreate", label: "Procreate", kind: "SKILL", aliases: ["procreate"] },
  { slug: "zbrush", label: "ZBrush", kind: "SKILL", aliases: ["zbrush"] },
  { slug: "art-history", label: "Art History", kind: "INTEREST", aliases: ["art history"] },
];

// --- MUSIC ------------------------------------------------------------------
const MUSIC: CatalogTag[] = [
  { slug: "music-production", label: "Music Production", kind: "SKILL", aliases: ["music production", "producing", "beatmaking"] },
  { slug: "songwriting", label: "Songwriting", kind: "SKILL", aliases: ["songwriting", "songwriter"] },
  { slug: "composition", label: "Composition", kind: "SKILL", aliases: ["composition", "composing"] },
  { slug: "arranging", label: "Arranging", kind: "SKILL", aliases: ["arranging", "arrangement"] },
  { slug: "orchestration", label: "Orchestration", kind: "SKILL", aliases: ["orchestration"] },
  { slug: "music-theory", label: "Music Theory", kind: "SKILL", aliases: ["music theory"] },
  { slug: "audio-engineering", label: "Audio Engineering", kind: "SKILL", aliases: ["audio engineering", "sound engineering"] },
  { slug: "mixing", label: "Mixing", kind: "SKILL", aliases: ["mixing", "mixdown"] },
  { slug: "mastering", label: "Mastering", kind: "SKILL", aliases: ["mastering"] },
  { slug: "sound-design", label: "Sound Design", kind: "SKILL", aliases: ["sound design"] },
  { slug: "sound-synthesis", label: "Sound Synthesis", kind: "SKILL", aliases: ["synthesis", "synths", "modular synthesis"] },
  { slug: "sampling", label: "Sampling", kind: "SKILL", aliases: ["sampling", "samples"] },
  { slug: "field-recording", label: "Field Recording", kind: "SKILL", aliases: ["field recording"] },
  { slug: "foley", label: "Foley", kind: "SKILL", aliases: ["foley"] },
  { slug: "film-scoring", label: "Film Scoring", kind: "SKILL", aliases: ["film scoring", "scoring", "soundtrack"] },
  { slug: "live-sound", label: "Live Sound", kind: "SKILL", aliases: ["live sound", "front of house"] },
  { slug: "djing", label: "DJing", kind: "SKILL", aliases: ["dj", "djing", "turntablism"] },
  { slug: "midi", label: "MIDI", kind: "SKILL", aliases: ["midi"] },
  { slug: "audio-plugin-development", label: "Audio Plugin Development", kind: "SKILL", aliases: ["audio plugins", "vst", "juce"] },
  { slug: "ableton-live", label: "Ableton Live", kind: "SKILL", aliases: ["ableton", "ableton live"] },
  { slug: "logic-pro", label: "Logic Pro", kind: "SKILL", aliases: ["logic pro"] },
  { slug: "fl-studio", label: "FL Studio", kind: "SKILL", aliases: ["fl studio", "fruity loops"] },
  { slug: "pro-tools", label: "Pro Tools", kind: "SKILL", aliases: ["pro tools", "protools"] },
  { slug: "reaper", label: "Reaper", kind: "SKILL", aliases: ["reaper daw"] },
  { slug: "max-msp", label: "Max/MSP", kind: "SKILL", aliases: ["max msp", "max/msp"] },
  { slug: "supercollider", label: "SuperCollider", kind: "SKILL", aliases: ["supercollider"] },
  { slug: "vocals", label: "Vocals", kind: "SKILL", aliases: ["vocals", "singing", "voice"] },
  { slug: "guitar", label: "Guitar", kind: "SKILL", aliases: ["guitar", "guitarist"] },
  { slug: "bass", label: "Bass", kind: "SKILL", aliases: ["bass", "bass guitar", "bassist"] },
  { slug: "piano", label: "Piano", kind: "SKILL", aliases: ["piano", "keys", "keyboard"] },
  { slug: "drums", label: "Drums", kind: "SKILL", aliases: ["drums", "drummer", "percussion"] },
  { slug: "violin", label: "Violin", kind: "SKILL", aliases: ["violin", "violinist"] },
  { slug: "cello", label: "Cello", kind: "SKILL", aliases: ["cello"] },
  { slug: "saxophone", label: "Saxophone", kind: "SKILL", aliases: ["saxophone", "sax"] },
  { slug: "trumpet", label: "Trumpet", kind: "SKILL", aliases: ["trumpet"] },
  { slug: "flute", label: "Flute", kind: "SKILL", aliases: ["flute"] },
  { slug: "choral", label: "Choral", kind: "SKILL", aliases: ["choir", "choral"] },
  { slug: "music-business", label: "Music Business", kind: "SKILL", aliases: ["music business", "music industry"] },
  { slug: "music-licensing", label: "Music Licensing", kind: "SKILL", aliases: ["music licensing", "sync licensing"] },
  { slug: "a-r", label: "A&R", kind: "SKILL", aliases: ["a&r", "a and r"] },
  { slug: "music-video", label: "Music Video", kind: "SKILL", aliases: ["music video"] },
  { slug: "jazz", label: "Jazz", kind: "INTEREST", aliases: ["jazz"] },
  { slug: "classical-music", label: "Classical Music", kind: "INTEREST", aliases: ["classical music", "classical"] },
  { slug: "electronic-music", label: "Electronic Music", kind: "INTEREST", aliases: ["electronic music", "edm", "techno"] },
  { slug: "hip-hop", label: "Hip-Hop", kind: "INTEREST", aliases: ["hip hop", "hip-hop", "rap"] },
];

// --- FINANCE ----------------------------------------------------------------
const FINANCE: CatalogTag[] = [
  { slug: "financial-modeling", label: "Financial Modeling", kind: "SKILL", aliases: ["financial modeling", "financial modelling"] },
  { slug: "valuation", label: "Valuation", kind: "SKILL", aliases: ["valuation", "dcf"] },
  { slug: "financial-analysis", label: "Financial Analysis", kind: "SKILL", aliases: ["financial analysis", "fp&a"] },
  { slug: "accounting", label: "Accounting", kind: "SKILL", aliases: ["accounting", "accountancy"] },
  { slug: "bookkeeping", label: "Bookkeeping", kind: "SKILL", aliases: ["bookkeeping"] },
  { slug: "financial-reporting", label: "Financial Reporting", kind: "SKILL", aliases: ["financial reporting", "financial statements"] },
  { slug: "auditing", label: "Auditing", kind: "SKILL", aliases: ["auditing", "audit"] },
  { slug: "taxation", label: "Taxation", kind: "SKILL", aliases: ["taxation", "tax"] },
  { slug: "corporate-finance", label: "Corporate Finance", kind: "SKILL", aliases: ["corporate finance"] },
  { slug: "equity-research", label: "Equity Research", kind: "SKILL", aliases: ["equity research"] },
  { slug: "investment-banking", label: "Investment Banking", kind: "SKILL", aliases: ["investment banking"] },
  { slug: "private-equity", label: "Private Equity", kind: "SKILL", aliases: ["private equity"] },
  { slug: "venture-capital", label: "Venture Capital", kind: "SKILL", aliases: ["venture capital", "vc"] },
  { slug: "hedge-funds", label: "Hedge Funds", kind: "SKILL", aliases: ["hedge funds", "hedge fund"] },
  { slug: "capital-markets", label: "Capital Markets", kind: "SKILL", aliases: ["capital markets"] },
  { slug: "m-a", label: "M&A", kind: "SKILL", aliases: ["m&a", "mergers and acquisitions", "mergers"] },
  { slug: "portfolio-management", label: "Portfolio Management", kind: "SKILL", aliases: ["portfolio management"] },
  { slug: "risk-management", label: "Risk Management", kind: "SKILL", aliases: ["risk management", "risk"] },
  { slug: "credit-analysis", label: "Credit Analysis", kind: "SKILL", aliases: ["credit analysis", "credit risk"] },
  { slug: "quantitative-finance", label: "Quantitative Finance", kind: "SKILL", aliases: ["quantitative finance", "quant finance"] },
  { slug: "algorithmic-trading", label: "Algorithmic Trading", kind: "SKILL", aliases: ["algorithmic trading", "algo trading"] },
  { slug: "derivatives", label: "Derivatives", kind: "SKILL", aliases: ["derivatives", "options", "futures"] },
  { slug: "fixed-income", label: "Fixed Income", kind: "SKILL", aliases: ["fixed income", "bonds"] },
  { slug: "treasury", label: "Treasury", kind: "SKILL", aliases: ["treasury"] },
  { slug: "budgeting", label: "Budgeting", kind: "SKILL", aliases: ["budgeting", "budgets"] },
  { slug: "forecasting", label: "Forecasting", kind: "SKILL", aliases: ["forecasting", "financial forecasting"] },
  { slug: "unit-economics", label: "Unit Economics", kind: "SKILL", aliases: ["unit economics"] },
  { slug: "pricing-strategy", label: "Pricing Strategy", kind: "SKILL", aliases: ["pricing", "pricing strategy"] },
  { slug: "cap-tables", label: "Cap Tables", kind: "SKILL", aliases: ["cap table", "captable"] },
  { slug: "fundraising", label: "Fundraising", kind: "SKILL", aliases: ["fundraising", "raising a round"] },
  { slug: "investor-relations", label: "Investor Relations", kind: "SKILL", aliases: ["investor relations"] },
  { slug: "excel", label: "Excel", kind: "SKILL", aliases: ["excel", "microsoft excel", "spreadsheets"] },
  { slug: "bloomberg-terminal", label: "Bloomberg Terminal", kind: "SKILL", aliases: ["bloomberg", "bloomberg terminal"] },
  { slug: "economics", label: "Economics", kind: "SKILL", aliases: ["economics", "econ"] },
  { slug: "econometrics", label: "Econometrics", kind: "SKILL", aliases: ["econometrics"] },
  { slug: "macroeconomics", label: "Macroeconomics", kind: "SKILL", aliases: ["macroeconomics", "macro"] },
  { slug: "behavioral-finance", label: "Behavioral Finance", kind: "SKILL", aliases: ["behavioral finance", "behavioural finance"] },
  { slug: "personal-finance", label: "Personal Finance", kind: "SKILL", aliases: ["personal finance"] },
  { slug: "real-estate-finance", label: "Real Estate Finance", kind: "SKILL", aliases: ["real estate finance"] },
  { slug: "actuarial-science", label: "Actuarial Science", kind: "SKILL", aliases: ["actuarial science", "actuary"] },
  { slug: "insurance", label: "Insurance", kind: "SKILL", aliases: ["insurance"] },
  { slug: "esg-investing", label: "ESG Investing", kind: "SKILL", aliases: ["esg", "sustainable investing"] },
  { slug: "defi", label: "DeFi", kind: "SKILL", aliases: ["defi", "decentralized finance"] },
  { slug: "banking", label: "Banking", kind: "DOMAIN", aliases: ["banking", "retail banking"] },
  { slug: "capital-allocation", label: "Capital Allocation", kind: "SKILL", aliases: ["capital allocation"] },
];

// --- BUSINESS ---------------------------------------------------------------
const BUSINESS: CatalogTag[] = [
  { slug: "business-strategy", label: "Business Strategy", kind: "SKILL", aliases: ["business strategy", "strategy"] },
  { slug: "go-to-market", label: "Go-to-Market", kind: "SKILL", aliases: ["go to market", "gtm"] },
  { slug: "market-research", label: "Market Research", kind: "SKILL", aliases: ["market research"] },
  { slug: "competitive-analysis", label: "Competitive Analysis", kind: "SKILL", aliases: ["competitive analysis", "competitor research"] },
  { slug: "business-development", label: "Business Development", kind: "SKILL", aliases: ["business development", "biz dev"] },
  { slug: "sales", label: "Sales", kind: "SKILL", aliases: ["sales", "selling"] },
  { slug: "b2b-sales", label: "B2B Sales", kind: "SKILL", aliases: ["b2b sales", "enterprise sales"] },
  { slug: "account-management", label: "Account Management", kind: "SKILL", aliases: ["account management"] },
  { slug: "customer-success", label: "Customer Success", kind: "SKILL", aliases: ["customer success"] },
  { slug: "crm", label: "CRM", kind: "SKILL", aliases: ["crm", "salesforce", "hubspot"] },
  { slug: "marketing-strategy", label: "Marketing Strategy", kind: "SKILL", aliases: ["marketing strategy", "marketing"] },
  { slug: "brand-strategy", label: "Brand Strategy", kind: "SKILL", aliases: ["brand strategy"] },
  { slug: "content-marketing", label: "Content Marketing", kind: "SKILL", aliases: ["content marketing", "content strategy"] },
  { slug: "social-media-marketing", label: "Social Media Marketing", kind: "SKILL", aliases: ["social media marketing"] },
  { slug: "email-marketing", label: "Email Marketing", kind: "SKILL", aliases: ["email marketing", "newsletters"] },
  { slug: "performance-marketing", label: "Performance Marketing", kind: "SKILL", aliases: ["performance marketing", "paid ads", "ppc"] },
  { slug: "product-marketing", label: "Product Marketing", kind: "SKILL", aliases: ["product marketing"] },
  { slug: "advertising", label: "Advertising", kind: "SKILL", aliases: ["advertising", "ad creative"] },
  { slug: "public-relations", label: "Public Relations", kind: "SKILL", aliases: ["public relations"] },
  { slug: "community-building", label: "Community Building", kind: "SKILL", aliases: ["community building", "community management"] },
  { slug: "partnerships", label: "Partnerships", kind: "SKILL", aliases: ["partnerships", "strategic partnerships"] },
  { slug: "operations", label: "Operations", kind: "SKILL", aliases: ["operations", "ops"] },
  { slug: "supply-chain", label: "Supply Chain", kind: "SKILL", aliases: ["supply chain"] },
  { slug: "procurement", label: "Procurement", kind: "SKILL", aliases: ["procurement", "sourcing"] },
  { slug: "project-management", label: "Project Management", kind: "SKILL", aliases: ["project management", "pmp"] },
  { slug: "program-management", label: "Program Management", kind: "SKILL", aliases: ["program management"] },
  { slug: "agile", label: "Agile", kind: "SKILL", aliases: ["agile", "scrum", "kanban"] },
  { slug: "business-analysis", label: "Business Analysis", kind: "SKILL", aliases: ["business analysis"] },
  { slug: "process-improvement", label: "Process Improvement", kind: "SKILL", aliases: ["process improvement", "lean", "six sigma"] },
  { slug: "business-intelligence", label: "Business Intelligence", kind: "SKILL", aliases: ["business intelligence", "tableau", "power bi"] },
  { slug: "people-ops", label: "People Ops", kind: "SKILL", aliases: ["people ops", "human resources"] },
  { slug: "recruiting", label: "Recruiting", kind: "SKILL", aliases: ["recruiting", "talent acquisition", "hiring"] },
  { slug: "legal", label: "Legal", kind: "SKILL", aliases: ["legal", "law"] },
  { slug: "contracts", label: "Contracts", kind: "SKILL", aliases: ["contracts", "contract law"] },
  { slug: "intellectual-property", label: "Intellectual Property", kind: "SKILL", aliases: ["intellectual property", "patents", "trademarks"] },
  { slug: "compliance", label: "Compliance", kind: "SKILL", aliases: ["compliance", "regulatory"] },
  { slug: "corporate-governance", label: "Corporate Governance", kind: "SKILL", aliases: ["corporate governance", "governance"] },
  { slug: "entrepreneurship", label: "Entrepreneurship", kind: "SKILL", aliases: ["entrepreneurship", "founding"] },
  { slug: "pitching", label: "Pitching", kind: "SKILL", aliases: ["pitching", "pitch deck"] },
  { slug: "customer-discovery", label: "Customer Discovery", kind: "SKILL", aliases: ["customer discovery", "user interviews"] },
  { slug: "business-model-design", label: "Business Model Design", kind: "SKILL", aliases: ["business model", "business model design"] },
  { slug: "consulting", label: "Consulting", kind: "SKILL", aliases: ["consulting", "management consulting"] },
  { slug: "event-management", label: "Event Management", kind: "SKILL", aliases: ["event management", "events"] },
  { slug: "nonprofit-management", label: "Nonprofit Management", kind: "SKILL", aliases: ["nonprofit", "ngo", "non-profit"] },
  { slug: "social-entrepreneurship", label: "Social Entrepreneurship", kind: "SKILL", aliases: ["social entrepreneurship", "social enterprise"] },
  { slug: "okrs-goal-setting", label: "OKRs & Goal Setting", kind: "SKILL", aliases: ["okr", "okrs", "goal setting"] },
  { slug: "stakeholder-management", label: "Stakeholder Management", kind: "SKILL", aliases: ["stakeholder management"] },
  { slug: "retail", label: "Retail", kind: "DOMAIN", aliases: ["retail"] },
  { slug: "hospitality", label: "Hospitality", kind: "DOMAIN", aliases: ["hospitality", "travel"] },
  { slug: "real-estate", label: "Real Estate", kind: "DOMAIN", aliases: ["real estate", "proptech"] },
];

// --- SOFT SKILLS ------------------------------------------------------------
const SOFT: CatalogTag[] = [
  { slug: "leadership", label: "Leadership", kind: "SKILL", aliases: ["leadership", "leading teams"] },
  { slug: "teamwork", label: "Teamwork", kind: "SKILL", aliases: ["teamwork", "collaboration"] },
  { slug: "communication", label: "Communication", kind: "SKILL", aliases: ["communication", "communicating"] },
  { slug: "facilitation", label: "Facilitation", kind: "SKILL", aliases: ["facilitation", "workshop facilitation"] },
  { slug: "mentoring", label: "Mentoring", kind: "SKILL", aliases: ["mentoring", "coaching"] },
  { slug: "teaching", label: "Teaching", kind: "SKILL", aliases: ["teaching", "tutoring", "instruction"] },
  { slug: "negotiation", label: "Negotiation", kind: "SKILL", aliases: ["negotiation", "negotiating"] },
  { slug: "conflict-resolution", label: "Conflict Resolution", kind: "SKILL", aliases: ["conflict resolution"] },
  { slug: "active-listening", label: "Active Listening", kind: "SKILL", aliases: ["active listening", "listening"] },
  { slug: "giving-feedback", label: "Giving Feedback", kind: "SKILL", aliases: ["giving feedback", "feedback"] },
  { slug: "storytelling", label: "Storytelling", kind: "SKILL", aliases: ["storytelling", "narrative"] },
  { slug: "persuasion", label: "Persuasion", kind: "SKILL", aliases: ["persuasion", "influencing"] },
  { slug: "presentation-design", label: "Presentation Design", kind: "SKILL", aliases: ["presentation design", "slides", "decks"] },
  { slug: "cross-cultural-communication", label: "Cross-Cultural Communication", kind: "SKILL", aliases: ["cross cultural communication", "intercultural"] },
  { slug: "time-management", label: "Time Management", kind: "SKILL", aliases: ["time management"] },
  { slug: "prioritization", label: "Prioritization", kind: "SKILL", aliases: ["prioritization", "prioritisation"] },
  { slug: "problem-solving", label: "Problem Solving", kind: "SKILL", aliases: ["problem solving"] },
  { slug: "critical-thinking", label: "Critical Thinking", kind: "SKILL", aliases: ["critical thinking"] },
  { slug: "decision-making", label: "Decision Making", kind: "SKILL", aliases: ["decision making"] },
  { slug: "systems-thinking", label: "Systems Thinking", kind: "SKILL", aliases: ["systems thinking"] },
  { slug: "adaptability", label: "Adaptability", kind: "SKILL", aliases: ["adaptability", "flexibility"] },
  { slug: "resilience", label: "Resilience", kind: "SKILL", aliases: ["resilience", "perseverance"] },
  { slug: "empathy", label: "Empathy", kind: "SKILL", aliases: ["empathy"] },
  { slug: "emotional-intelligence", label: "Emotional Intelligence", kind: "SKILL", aliases: ["emotional intelligence"] },
  { slug: "accountability", label: "Accountability", kind: "SKILL", aliases: ["accountability", "ownership"] },
  { slug: "initiative", label: "Initiative", kind: "SKILL", aliases: ["initiative", "self starter"] },
  { slug: "delegation", label: "Delegation", kind: "SKILL", aliases: ["delegation", "delegating"] },
  { slug: "team-building", label: "Team Building", kind: "SKILL", aliases: ["team building"] },
  { slug: "remote-collaboration", label: "Remote Collaboration", kind: "SKILL", aliases: ["remote collaboration", "async work", "remote work"] },
  { slug: "self-directed-learning", label: "Self-Directed Learning", kind: "SKILL", aliases: ["self directed learning", "self taught"] },
  { slug: "attention-to-detail", label: "Attention to Detail", kind: "SKILL", aliases: ["attention to detail"] },
  { slug: "creativity", label: "Creativity", kind: "SKILL", aliases: ["creativity", "creative thinking"] },
  { slug: "networking", label: "Networking", kind: "SKILL", aliases: ["networking", "relationship building"] },
  { slug: "interviewing", label: "Interviewing", kind: "SKILL", aliases: ["interviewing", "conducting interviews"] },
  { slug: "research", label: "Research", kind: "SKILL", aliases: ["research", "desk research"] },
  { slug: "documentation", label: "Documentation", kind: "SKILL", aliases: ["documentation", "writing docs"] },
  { slug: "stress-management", label: "Stress Management", kind: "SKILL", aliases: ["stress management"] },
];

export const CATALOG_TAGS: CatalogTag[] = [...ART, ...MUSIC, ...FINANCE, ...BUSINESS, ...SOFT];

export const CATALOG_TAG_GROUPS = {
  art: ART,
  music: MUSIC,
  finance: FINANCE,
  business: BUSINESS,
  soft: SOFT,
} as const;
