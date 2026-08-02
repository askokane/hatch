/**
 * HATCH — database seed.
 *
 * Produces a demo-ready dataset: a full tag taxonomy, 24 verified users with
 * complete profiles, 10 projects across all three stages, open roles, a set of
 * accepted + pending intro requests with real threaded conversations, and
 * profile posts timed to interleave with the project updates in the feed.
 *
 * Run with:  npm run seed   (wraps `tsx prisma/seed.ts`)
 * Idempotent: wipes every table first, so it can be re-run safely.
 */
import { PrismaClient, TagKind, TagRelation, IntentKind, ProjectStage, ProjectVisibility, Commitment, RoleStatus, ContextType, RequestStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
// Relative, not "@/..." — tsx runs this file without tsconfig path resolution.
import { catalogSlug } from "../src/lib/catalog-slug";

const prisma = new PrismaClient();

const PASSWORD = "HatchDemo!2026";
const BCRYPT_COST = 12;

// Helper: a Date `days` (and optional `hours`) in the past.
function ago(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
}

// ---------------------------------------------------------------------------
// 1. TAG TAXONOMY  (100+ tags; aliases fold alternate spellings into one row)
// ---------------------------------------------------------------------------

type TagSeed = { slug: string; label: string; kind: TagKind; aliases: string[] };

const TAGS: TagSeed[] = [
  // --- SKILL: languages ---
  { slug: "javascript", label: "JavaScript", kind: TagKind.SKILL, aliases: ["javascript", "js", "ecmascript"] },
  { slug: "typescript", label: "TypeScript", kind: TagKind.SKILL, aliases: ["typescript", "ts"] },
  { slug: "python", label: "Python", kind: TagKind.SKILL, aliases: ["python", "py", "python3"] },
  { slug: "go", label: "Go", kind: TagKind.SKILL, aliases: ["go", "golang"] },
  { slug: "rust", label: "Rust", kind: TagKind.SKILL, aliases: ["rust", "rustlang"] },
  { slug: "java", label: "Java", kind: TagKind.SKILL, aliases: ["java"] },
  { slug: "cpp", label: "C++", kind: TagKind.SKILL, aliases: ["c++", "cpp", "cplusplus"] },
  { slug: "ruby", label: "Ruby", kind: TagKind.SKILL, aliases: ["ruby"] },
  { slug: "swift", label: "Swift", kind: TagKind.SKILL, aliases: ["swift"] },
  { slug: "kotlin", label: "Kotlin", kind: TagKind.SKILL, aliases: ["kotlin", "kt"] },
  { slug: "php", label: "PHP", kind: TagKind.SKILL, aliases: ["php"] },
  { slug: "scala", label: "Scala", kind: TagKind.SKILL, aliases: ["scala"] },
  { slug: "sql", label: "SQL", kind: TagKind.SKILL, aliases: ["sql"] },
  { slug: "html", label: "HTML", kind: TagKind.SKILL, aliases: ["html", "html5"] },
  { slug: "css", label: "CSS", kind: TagKind.SKILL, aliases: ["css", "css3"] },
  // --- SKILL: frameworks / libraries ---
  { slug: "react", label: "React", kind: TagKind.SKILL, aliases: ["react", "reactjs", "react.js"] },
  { slug: "nextjs", label: "Next.js", kind: TagKind.SKILL, aliases: ["nextjs", "next.js", "next"] },
  { slug: "vue", label: "Vue", kind: TagKind.SKILL, aliases: ["vue", "vuejs", "vue.js"] },
  { slug: "svelte", label: "Svelte", kind: TagKind.SKILL, aliases: ["svelte", "sveltekit"] },
  { slug: "angular", label: "Angular", kind: TagKind.SKILL, aliases: ["angular", "angularjs"] },
  { slug: "node", label: "Node.js", kind: TagKind.SKILL, aliases: ["node", "nodejs", "node.js"] },
  { slug: "express", label: "Express", kind: TagKind.SKILL, aliases: ["express", "expressjs"] },
  { slug: "django", label: "Django", kind: TagKind.SKILL, aliases: ["django"] },
  { slug: "flask", label: "Flask", kind: TagKind.SKILL, aliases: ["flask"] },
  { slug: "rails", label: "Ruby on Rails", kind: TagKind.SKILL, aliases: ["rails", "ruby on rails", "ror"] },
  { slug: "spring", label: "Spring", kind: TagKind.SKILL, aliases: ["spring", "spring boot", "springboot"] },
  { slug: "dotnet", label: ".NET", kind: TagKind.SKILL, aliases: [".net", "dotnet", "asp.net"] },
  { slug: "graphql", label: "GraphQL", kind: TagKind.SKILL, aliases: ["graphql", "gql"] },
  { slug: "rest-apis", label: "REST APIs", kind: TagKind.SKILL, aliases: ["rest", "rest api", "rest apis", "restful"] },
  { slug: "tailwind", label: "Tailwind CSS", kind: TagKind.SKILL, aliases: ["tailwind", "tailwindcss", "tailwind css"] },
  // --- SKILL: mobile ---
  { slug: "react-native", label: "React Native", kind: TagKind.SKILL, aliases: ["react native", "reactnative", "rn"] },
  { slug: "flutter", label: "Flutter", kind: TagKind.SKILL, aliases: ["flutter"] },
  { slug: "ios", label: "iOS", kind: TagKind.SKILL, aliases: ["ios", "ios dev"] },
  { slug: "android", label: "Android", kind: TagKind.SKILL, aliases: ["android", "android dev"] },
  // --- SKILL: data / ML ---
  { slug: "machine-learning", label: "Machine Learning", kind: TagKind.SKILL, aliases: ["machine learning", "ml"] },
  { slug: "deep-learning", label: "Deep Learning", kind: TagKind.SKILL, aliases: ["deep learning", "dl"] },
  { slug: "pytorch", label: "PyTorch", kind: TagKind.SKILL, aliases: ["pytorch", "torch"] },
  { slug: "tensorflow", label: "TensorFlow", kind: TagKind.SKILL, aliases: ["tensorflow", "tf"] },
  { slug: "pandas", label: "pandas", kind: TagKind.SKILL, aliases: ["pandas"] },
  { slug: "numpy", label: "NumPy", kind: TagKind.SKILL, aliases: ["numpy"] },
  { slug: "nlp", label: "NLP", kind: TagKind.SKILL, aliases: ["nlp", "natural language processing"] },
  { slug: "computer-vision", label: "Computer Vision", kind: TagKind.SKILL, aliases: ["computer vision", "cv"] },
  { slug: "data-science", label: "Data Science", kind: TagKind.SKILL, aliases: ["data science", "datascience"] },
  { slug: "data-engineering", label: "Data Engineering", kind: TagKind.SKILL, aliases: ["data engineering"] },
  { slug: "data-viz", label: "Data Visualization", kind: TagKind.SKILL, aliases: ["data visualization", "dataviz", "data viz"] },
  // --- SKILL: devops / cloud / infra ---
  { slug: "docker", label: "Docker", kind: TagKind.SKILL, aliases: ["docker"] },
  { slug: "kubernetes", label: "Kubernetes", kind: TagKind.SKILL, aliases: ["kubernetes", "k8s"] },
  { slug: "aws", label: "AWS", kind: TagKind.SKILL, aliases: ["aws", "amazon web services"] },
  { slug: "gcp", label: "Google Cloud", kind: TagKind.SKILL, aliases: ["gcp", "google cloud", "google cloud platform"] },
  { slug: "azure", label: "Azure", kind: TagKind.SKILL, aliases: ["azure", "microsoft azure"] },
  { slug: "ci-cd", label: "CI/CD", kind: TagKind.SKILL, aliases: ["ci/cd", "cicd", "ci cd"] },
  { slug: "terraform", label: "Terraform", kind: TagKind.SKILL, aliases: ["terraform"] },
  { slug: "linux", label: "Linux", kind: TagKind.SKILL, aliases: ["linux"] },
  { slug: "git", label: "Git", kind: TagKind.SKILL, aliases: ["git"] },
  // --- SKILL: databases ---
  { slug: "postgres", label: "PostgreSQL", kind: TagKind.SKILL, aliases: ["postgres", "postgresql", "psql"] },
  { slug: "mongodb", label: "MongoDB", kind: TagKind.SKILL, aliases: ["mongodb", "mongo"] },
  { slug: "redis", label: "Redis", kind: TagKind.SKILL, aliases: ["redis"] },
  { slug: "mysql", label: "MySQL", kind: TagKind.SKILL, aliases: ["mysql"] },
  { slug: "prisma", label: "Prisma", kind: TagKind.SKILL, aliases: ["prisma"] },
  // --- SKILL: design ---
  { slug: "figma", label: "Figma", kind: TagKind.SKILL, aliases: ["figma"] },
  { slug: "ui-design", label: "UI Design", kind: TagKind.SKILL, aliases: ["ui", "ui design", "ui/ux", "interface design"] },
  { slug: "ux-research", label: "UX Research", kind: TagKind.SKILL, aliases: ["ux research", "user research", "ux"] },
  { slug: "prototyping", label: "Prototyping", kind: TagKind.SKILL, aliases: ["prototyping", "prototype"] },
  { slug: "illustration", label: "Illustration", kind: TagKind.SKILL, aliases: ["illustration", "illustrator"] },
  { slug: "design-systems", label: "Design Systems", kind: TagKind.SKILL, aliases: ["design systems", "design system"] },
  { slug: "motion-design", label: "Motion Design", kind: TagKind.SKILL, aliases: ["motion design", "motion"] },
  { slug: "brand-design", label: "Brand Design", kind: TagKind.SKILL, aliases: ["brand design", "branding"] },
  // --- SKILL: other technical ---
  { slug: "webgl", label: "WebGL", kind: TagKind.SKILL, aliases: ["webgl", "three.js", "threejs"] },
  { slug: "blockchain", label: "Blockchain", kind: TagKind.SKILL, aliases: ["blockchain", "web3", "crypto"] },
  { slug: "solidity", label: "Solidity", kind: TagKind.SKILL, aliases: ["solidity"] },
  { slug: "game-dev", label: "Game Development", kind: TagKind.SKILL, aliases: ["game dev", "gamedev", "game development"] },
  { slug: "unity", label: "Unity", kind: TagKind.SKILL, aliases: ["unity", "unity3d"] },
  { slug: "embedded", label: "Embedded Systems", kind: TagKind.SKILL, aliases: ["embedded", "embedded systems", "firmware"] },
  // --- SKILL: product / growth / comms ---
  { slug: "product-management", label: "Product Management", kind: TagKind.SKILL, aliases: ["product management", "pm", "product"] },
  { slug: "growth", label: "Growth", kind: TagKind.SKILL, aliases: ["growth", "growth marketing"] },
  { slug: "seo", label: "SEO", kind: TagKind.SKILL, aliases: ["seo", "search engine optimization"] },
  { slug: "copywriting", label: "Copywriting", kind: TagKind.SKILL, aliases: ["copywriting", "copy"] },
  { slug: "technical-writing", label: "Technical Writing", kind: TagKind.SKILL, aliases: ["technical writing", "tech writing"] },
  { slug: "public-speaking", label: "Public Speaking", kind: TagKind.SKILL, aliases: ["public speaking"] },
  // --- INTEREST ---
  { slug: "open-source", label: "Open Source", kind: TagKind.INTEREST, aliases: ["open source", "oss"] },
  { slug: "startups", label: "Startups", kind: TagKind.INTEREST, aliases: ["startups", "startup"] },
  { slug: "hackathons", label: "Hackathons", kind: TagKind.INTEREST, aliases: ["hackathons", "hackathon"] },
  { slug: "accessibility", label: "Accessibility", kind: TagKind.INTEREST, aliases: ["accessibility", "a11y"] },
  { slug: "sustainability", label: "Sustainability", kind: TagKind.INTEREST, aliases: ["sustainability", "eco"] },
  { slug: "gaming", label: "Gaming", kind: TagKind.INTEREST, aliases: ["gaming", "games", "video games"] },
  { slug: "robotics", label: "Robotics", kind: TagKind.INTEREST, aliases: ["robotics"] },
  { slug: "music", label: "Music", kind: TagKind.INTEREST, aliases: ["music", "music production"] },
  { slug: "photography", label: "Photography", kind: TagKind.INTEREST, aliases: ["photography", "photo"] },
  { slug: "writing", label: "Writing", kind: TagKind.INTEREST, aliases: ["writing", "creative writing"] },
  // --- DOMAIN ---
  { slug: "fintech", label: "Fintech", kind: TagKind.DOMAIN, aliases: ["fintech", "financial technology"] },
  { slug: "healthtech", label: "Healthtech", kind: TagKind.DOMAIN, aliases: ["healthtech", "health tech", "digital health"] },
  { slug: "edtech", label: "Edtech", kind: TagKind.DOMAIN, aliases: ["edtech", "education technology"] },
  { slug: "climate-tech", label: "Climate & Energy", kind: TagKind.DOMAIN, aliases: ["climate", "climate tech", "cleantech", "energy"] },
  { slug: "ecommerce", label: "E-commerce", kind: TagKind.DOMAIN, aliases: ["ecommerce", "e-commerce"] },
  { slug: "social", label: "Social & Community", kind: TagKind.DOMAIN, aliases: ["social", "social media", "community"] },
  { slug: "developer-tools", label: "Developer Tools", kind: TagKind.DOMAIN, aliases: ["developer tools", "devtools", "dev tools"] },
  { slug: "productivity", label: "Productivity", kind: TagKind.DOMAIN, aliases: ["productivity"] },
  { slug: "logistics", label: "Logistics", kind: TagKind.DOMAIN, aliases: ["logistics", "supply chain"] },
  { slug: "media", label: "Media & Content", kind: TagKind.DOMAIN, aliases: ["media", "content"] },
];

// ---------------------------------------------------------------------------
// 2. USERS + PROFILES
// ---------------------------------------------------------------------------

type IntentSeed = { kind: IntentKind; note: string };
type UserSeed = {
  handle: string;
  email: string;
  name: string;
  school: string;
  gradYear: number;
  bio: string;
  links: { label: string; url: string }[];
  isAdmin?: boolean;
  isDiscoverable?: boolean;
  skills: string[]; // HAS
  learning: string[]; // LEARNING
  intents: IntentSeed[];
};

// "Based in" is derived rather than written into all 24 records: most students
// are near their campus, so the school implies the city, and only the exceptions
// are worth stating.
const CAMPUS_CITY: Record<string, string> = {
  "State University": "Austin, United States",
  "Northgate University": "Seattle, United States",
  "Riverside Institute of Technology": "Chicago, United States",
  "Lakeside College": "Madison, United States",
  "Bay Metropolitan University": "San Francisco, United States",
};

// Handles whose location is not their campus city. The empty string is
// deliberate — "based in" is optional, and the demo data has to contain a
// profile that omits it so the no-location render path is exercised.
const BASED_IN_OVERRIDES: Record<string, string> = {
  yuki_tanaka: "Tokyo, Japan",
  amara_okonkwo: "Lagos, Nigeria",
  omar_haddad: "Amman, Jordan",
  isabella_rossi: "Milan, Italy",
  sam_torres: "",
};

const USERS: UserSeed[] = [
  {
    handle: "alex_demo",
    email: "demo@stateu.edu",
    name: "Alex Rivera",
    school: "State University",
    gradYear: 2027,
    bio: "Building a lot of small tools I actually use — most recently a study app that turns lecture recordings into searchable notes. Looking for people who care about the details to build the next thing with me.",
    links: [
      { label: "GitHub", url: "https://github.com/alexrivera" },
      { label: "Portfolio", url: "https://alexrivera.dev" },
    ],
    skills: ["react", "typescript", "nextjs", "node", "prisma"],
    learning: ["rust", "machine-learning"],
    intents: [
      { kind: IntentKind.COFOUNDER, note: "Want to find a technical co-founder who's shipped something real, not just class projects." },
      { kind: IntentKind.FEEDBACK, note: "Happy to trade honest product feedback on early-stage student tools." },
    ],
  },
  {
    handle: "jordan_okafor",
    email: "admin@hatchdemo.edu",
    name: "Jordan Okafor",
    school: "Northgate University",
    gradYear: 2026,
    bio: "Product person who started as a designer and never fully left. I've run two campus product teams and I like turning vague ideas into something people can actually click.",
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/jordanokafor" }],
    isAdmin: true,
    skills: ["product-management", "ux-research", "figma", "prototyping"],
    learning: ["sql"],
    intents: [{ kind: IntentKind.MENTOR, note: "Looking for a mentor who's done product at an early-stage startup." }],
  },
  {
    handle: "maya_chen",
    email: "maya-chen@stateu.edu",
    name: "Maya Chen",
    school: "State University",
    gradYear: 2028,
    bio: "ML student who got into this because I wanted computers to read papers so I didn't have to. Spend most of my time fine-tuning small models and being annoyed at tokenizers.",
    links: [{ label: "GitHub", url: "https://github.com/mayachen" }],
    skills: ["python", "pytorch", "machine-learning", "nlp", "pandas"],
    learning: ["docker"],
    intents: [
      { kind: IntentKind.TEAMMATE, note: "Want a frontend teammate to put a real interface on my research tools." },
      { kind: IntentKind.INTERNSHIP, note: "Open to summer ML internships, especially anything NLP." },
    ],
  },
  {
    handle: "deepak_nair",
    email: "deepak-nair@stateu.edu",
    name: "Deepak Nair",
    school: "Riverside Institute of Technology",
    gradYear: 2027,
    bio: "Backend engineer at heart. I like systems that stay boring under load. Ran the infra for a campus food-delivery app that somehow survived finals-week traffic.",
    links: [
      { label: "GitHub", url: "https://github.com/deepaknair" },
      { label: "Blog", url: "https://deepak.systems" },
    ],
    skills: ["go", "postgres", "docker", "kubernetes", "rest-apis"],
    learning: ["rust"],
    intents: [{ kind: IntentKind.COFOUNDER, note: "Looking for a product-minded co-founder; I'll own the backend and infra." }],
  },
  {
    handle: "sofia_marino",
    email: "sofia-marino@hatchdemo.edu",
    name: "Sofia Marino",
    school: "Lakeside College",
    gradYear: 2029,
    bio: "Designer who's tired of beautiful Figma files nobody ships. I want to pair with engineers who'll actually build the thing and argue with me about it.",
    links: [{ label: "Dribbble", url: "https://dribbble.com/sofiamarino" }],
    skills: ["figma", "ui-design", "prototyping", "design-systems"],
    learning: ["react"],
    intents: [
      { kind: IntentKind.TEAMMATE, note: "Looking for a founding engineer to build my critique tool with." },
      { kind: IntentKind.MENTOR, note: "Would love a mentor who's built a design system from scratch." },
    ],
  },
  {
    handle: "liam_osei",
    email: "liam-osei@stateu.edu",
    name: "Liam Osei",
    school: "State University",
    gradYear: 2026,
    bio: "iOS developer since high school. Shipped a habit-tracker that got a few thousand downloads before I got bored and rewrote it in SwiftUI twice. Learning to finish things.",
    links: [{ label: "App Store", url: "https://apps.apple.com/dev/liamosei" }],
    skills: ["swift", "ios", "kotlin", "android"],
    learning: ["flutter"],
    intents: [
      { kind: IntentKind.INTERNSHIP, note: "Hunting for a mobile internship where I'd own a real feature." },
      { kind: IntentKind.FEEDBACK, note: "Always up for feedback on app UX and onboarding flows." },
    ],
  },
  {
    handle: "priya_shah",
    email: "priya-shah@stateu.edu",
    name: "Priya Shah",
    school: "Bay Metropolitan University",
    gradYear: 2028,
    bio: "Frontend developer who cares way too much about loading states. Currently building a scheduling tool for student workers because our dining-hall group chat was pure chaos.",
    links: [{ label: "GitHub", url: "https://github.com/priyashah" }],
    skills: ["javascript", "react", "css", "tailwind", "html"],
    learning: ["typescript"],
    intents: [{ kind: IntentKind.TEAMMATE, note: "Need a backend teammate to take my shift-swap app past the prototype." }],
  },
  {
    handle: "noah_berg",
    email: "noah-berg@hatchdemo.edu",
    name: "Noah Bergstrom",
    school: "Northgate University",
    gradYear: 2027,
    bio: "Data science major who likes the messy part — cleaning, joining, figuring out why the numbers lie. Building an AI tool that gives real feedback on pitch decks.",
    links: [{ label: "GitHub", url: "https://github.com/noahberg" }],
    skills: ["python", "data-science", "pandas", "data-viz", "sql"],
    learning: ["deep-learning"],
    intents: [
      { kind: IntentKind.INTERNSHIP, note: "Looking for a data-heavy summer internship." },
      { kind: IntentKind.COFOUNDER, note: "Exploring a co-founder for an AI feedback product; still early." },
    ],
  },
  {
    handle: "hana_kim",
    email: "hana-kim@stateu.edu",
    name: "Hana Kim",
    school: "State University",
    gradYear: 2029,
    bio: "Product designer focused on research first, pixels second. I run guerrilla usability tests in the library and bribe participants with coffee.",
    links: [{ label: "Portfolio", url: "https://hanakim.design" }],
    skills: ["figma", "ux-research", "ui-design", "brand-design"],
    learning: ["motion-design"],
    intents: [{ kind: IntentKind.TEAMMATE, note: "Want to join a small team that takes user research seriously." }],
  },
  {
    handle: "marcus_webb",
    email: "marcus-webb@stateu.edu",
    name: "Marcus Webb",
    school: "Riverside Institute of Technology",
    gradYear: 2026,
    bio: "Full-stack, but the backend is where I'm happiest. Built and actually launched an expense-splitting app my whole apartment building uses now. It handles real money, which terrifies me daily.",
    links: [
      { label: "GitHub", url: "https://github.com/marcuswebb" },
      { label: "Ledgerly", url: "https://ledgerly.app" },
    ],
    skills: ["node", "express", "mongodb", "rest-apis", "aws"],
    learning: ["graphql"],
    intents: [
      { kind: IntentKind.COFOUNDER, note: "Looking for a co-founder to turn Ledgerly into a real company." },
      { kind: IntentKind.MENTOR, note: "Would value a mentor who's dealt with payments and compliance." },
    ],
  },
  {
    handle: "yuki_tanaka",
    email: "yuki-tanaka@hatchdemo.edu",
    name: "Yuki Tanaka",
    school: "Lakeside College",
    gradYear: 2028,
    bio: "Systems and embedded person. I like when software has to respect physics. Currently making a tiny sensor board talk to a not-tiny cloud backend.",
    links: [{ label: "GitHub", url: "https://github.com/yukitanaka" }],
    skills: ["rust", "cpp", "embedded", "linux"],
    learning: ["go"],
    intents: [
      { kind: IntentKind.TEAMMATE, note: "Looking for a teammate on hardware-adjacent projects." },
      { kind: IntentKind.INTERNSHIP, note: "Interested in embedded or systems internships." },
    ],
  },
  {
    handle: "amara_okonkwo",
    email: "amara-okonkwo@stateu.edu",
    name: "Amara Okonkwo",
    school: "Bay Metropolitan University",
    gradYear: 2027,
    bio: "Growth and product. I'm the person who reads your analytics and tells you the uncomfortable truth. Got a campus sustainability app from 0 to 900 signups with basically no budget.",
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/amaraokonkwo" }],
    skills: ["product-management", "growth", "seo", "copywriting"],
    learning: ["sql"],
    intents: [{ kind: IntentKind.COFOUNDER, note: "Looking for a technical co-founder; I'll own growth, product, and story." }],
  },
  {
    handle: "ethan_park",
    email: "ethan-park@stateu.edu",
    name: "Ethan Park",
    school: "State University",
    gradYear: 2028,
    bio: "TypeScript maximalist building a degree-planning tool because advising at my school is a spreadsheet from 2011. I like typed end-to-end stacks and hate runtime surprises.",
    links: [{ label: "GitHub", url: "https://github.com/ethanpark" }],
    skills: ["typescript", "nextjs", "react", "prisma", "postgres"],
    learning: ["kubernetes"],
    intents: [
      { kind: IntentKind.TEAMMATE, note: "Want a designer teammate for the degree-planning tool." },
      { kind: IntentKind.FEEDBACK, note: "Looking for feedback on my data model for course prerequisites." },
    ],
  },
  {
    handle: "isabella_rossi",
    email: "isabella-rossi@hatchdemo.edu",
    name: "Isabella Rossi",
    school: "Northgate University",
    gradYear: 2029,
    bio: "Computer vision student who accidentally fell in love with the plumbing around models. I want my research to end up in something people touch, not just a PDF.",
    links: [{ label: "GitHub", url: "https://github.com/isabellarossi" }],
    skills: ["python", "flask", "machine-learning", "computer-vision"],
    learning: ["pytorch"],
    intents: [{ kind: IntentKind.INTERNSHIP, note: "Seeking a research-leaning ML or CV internship." }],
  },
  {
    handle: "omar_haddad",
    email: "omar-haddad@stateu.edu",
    name: "Omar Haddad",
    school: "Riverside Institute of Technology",
    gradYear: 2026,
    bio: "On-chain developer who's still skeptical of most of crypto, which I think makes me better at it. Building tools that would work even if the token part disappeared.",
    links: [{ label: "GitHub", url: "https://github.com/omarhaddad" }],
    skills: ["solidity", "blockchain", "javascript", "react"],
    learning: ["rust"],
    intents: [
      { kind: IntentKind.COFOUNDER, note: "Looking for a co-founder grounded in real user problems, not hype." },
      { kind: IntentKind.TEAMMATE, note: "Open to joining a team that needs on-chain work done right." },
    ],
  },
  {
    handle: "grace_liu",
    email: "grace-liu@stateu.edu",
    name: "Grace Liu",
    school: "State University",
    gradYear: 2027,
    bio: "Designer who codes just enough to be dangerous. I care about design systems that survive contact with a real codebase. Also I draw the little empty-state illustrations myself.",
    links: [{ label: "Portfolio", url: "https://graceliu.studio" }],
    skills: ["figma", "ui-design", "design-systems", "prototyping", "illustration"],
    learning: ["webgl"],
    intents: [{ kind: IntentKind.TEAMMATE, note: "Want to be the founding designer on something ambitious." }],
  },
  {
    handle: "daniel_mendez",
    email: "daniel-mendez@hatchdemo.edu",
    name: "Daniel Mendez",
    school: "Lakeside College",
    gradYear: 2028,
    bio: "Java and Spring guy who's unfashionable and fine with it. I like enterprise-boring tech because it lets me sleep. Trying to get better at the cloud side of things.",
    links: [{ label: "GitHub", url: "https://github.com/danielmendez" }],
    skills: ["java", "spring", "postgres", "docker"],
    learning: ["aws"],
    intents: [
      { kind: IntentKind.INTERNSHIP, note: "Looking for a backend internship, ideally JVM-heavy." },
      { kind: IntentKind.MENTOR, note: "Would love a mentor who's scaled a Spring service in production." },
    ],
  },
  {
    handle: "fatima_ali",
    email: "fatima-ali@stateu.edu",
    name: "Fatima Ali",
    school: "Bay Metropolitan University",
    gradYear: 2029,
    bio: "Full-stack Python developer who started with Django and keeps drifting toward the frontend. I like projects with a clear person on the other end who's helped.",
    links: [{ label: "GitHub", url: "https://github.com/fatimaali" }],
    skills: ["python", "django", "rest-apis", "react"],
    learning: ["machine-learning"],
    intents: [
      { kind: IntentKind.TEAMMATE, note: "Looking to join a mission-driven team as an engineer." },
      { kind: IntentKind.INTERNSHIP, note: "Open to full-stack internships." },
    ],
  },
  {
    handle: "tyler_nguyen",
    email: "tyler-nguyen@stateu.edu",
    name: "Tyler Nguyen",
    school: "State University",
    gradYear: 2026,
    bio: "Game developer who runs the campus game-jam club. I've made a dozen tiny games and one that almost works. Want to make it easier for other students to ship jam games.",
    links: [{ label: "itch.io", url: "https://tylernguyen.itch.io" }],
    skills: ["unity", "game-dev", "cpp"],
    learning: ["webgl"],
    intents: [
      { kind: IntentKind.COFOUNDER, note: "Looking for a co-founder for a student game-jam platform." },
      { kind: IntentKind.FEEDBACK, note: "Always want feedback on game feel and level pacing." },
    ],
  },
  {
    handle: "lena_petrova",
    email: "lena-petrova@hatchdemo.edu",
    name: "Lena Petrova",
    school: "Northgate University",
    gradYear: 2027,
    bio: "Data engineer who thinks pipelines are underrated art. I build the boring reliable stuff that lets the data scientists look smart. Currently heads-down and keeping my profile quiet.",
    links: [{ label: "GitHub", url: "https://github.com/lenapetrova" }],
    isDiscoverable: false,
    skills: ["data-engineering", "python", "sql", "aws", "docker"],
    learning: ["kubernetes"],
    intents: [{ kind: IntentKind.INTERNSHIP, note: "Looking for a data-engineering internship for next summer." }],
  },
  {
    handle: "kevin_osborne",
    email: "kevin-osborne@stateu.edu",
    name: "Kevin Osborne",
    school: "Riverside Institute of Technology",
    gradYear: 2028,
    bio: "React Native developer who likes shipping to real phones. Built the mobile app for a campus food-truck tracker and learned more from its one-star reviews than any class.",
    links: [{ label: "GitHub", url: "https://github.com/kevinosborne" }],
    skills: ["react-native", "javascript", "typescript", "node"],
    learning: ["swift"],
    intents: [
      { kind: IntentKind.TEAMMATE, note: "Looking to be the mobile person on a small team." },
      { kind: IntentKind.COFOUNDER, note: "Open to co-founding something mobile-first." },
    ],
  },
  {
    handle: "nadia_hassan",
    email: "nadia-hassan@stateu.edu",
    name: "Nadia Hassan",
    school: "State University",
    gradYear: 2029,
    bio: "UX researcher and technical writer. I turn confusing products into ones people understand, and I document things so the next person doesn't suffer. Keeping my profile private for now while I focus.",
    links: [{ label: "Portfolio", url: "https://nadiahassan.co" }],
    isDiscoverable: false,
    skills: ["ux-research", "figma", "technical-writing", "ui-design"],
    learning: ["prototyping"],
    intents: [{ kind: IntentKind.TEAMMATE, note: "Interested in joining a team that values research and clear docs." }],
  },
  {
    handle: "sam_torres",
    email: "sam-torres@hatchdemo.edu",
    name: "Sam Torres",
    school: "Lakeside College",
    gradYear: 2027,
    bio: "Platform and DevOps. I get a weird amount of joy from a clean CI pipeline and a green deploy. I'd rather delete code than write it. Ask me about Terraform, I dare you.",
    links: [{ label: "GitHub", url: "https://github.com/samtorres" }],
    skills: ["go", "terraform", "kubernetes", "aws", "ci-cd"],
    learning: ["rust"],
    intents: [
      { kind: IntentKind.MENTOR, note: "Looking for a mentor who's run platform teams at scale." },
      { kind: IntentKind.INTERNSHIP, note: "Seeking an SRE or platform internship." },
    ],
  },
  {
    handle: "chloe_adams",
    email: "chloe-adams@stateu.edu",
    name: "Chloe Adams",
    school: "Bay Metropolitan University",
    gradYear: 2026,
    bio: "Vue developer who came for the syntax and stayed for the community. I like building interfaces that feel fast and calm. Slowly learning React so I stop losing arguments about it.",
    links: [{ label: "GitHub", url: "https://github.com/chloeadams" }],
    skills: ["vue", "javascript", "css", "tailwind", "node"],
    learning: ["react"],
    intents: [
      { kind: IntentKind.COFOUNDER, note: "Looking for a co-founder who values craft in the frontend." },
      { kind: IntentKind.TEAMMATE, note: "Happy to be the frontend teammate on a product with taste." },
    ],
  },
];

// ---------------------------------------------------------------------------
// 3. PROJECTS (+ memberships, tags, updates, open roles)
// ---------------------------------------------------------------------------

type UpdateSeed = { authorHandle: string; body: string; daysAgo: number };
type RoleSeed = { title: string; description: string; commitment: Commitment; status?: RoleStatus; tags: string[] };
type ProjectSeed = {
  slug: string;
  name: string;
  description: string;
  stage: ProjectStage;
  visibility?: ProjectVisibility;
  links: { label: string; url: string }[];
  ownerHandle: string;
  members: { handle: string; role: string }[]; // owner listed first
  tags: string[];
  updates: UpdateSeed[];
  roles: RoleSeed[];
};

const PROJECTS: ProjectSeed[] = [
  {
    slug: "notemesh",
    name: "NoteMesh",
    description: "NoteMesh turns lecture recordings into searchable, timestamped notes you can actually study from. Upload a recording, get a clean transcript with the important moments pulled out and linked back to the audio.",
    stage: ProjectStage.LAUNCHED,
    links: [{ label: "Website", url: "https://notemesh.app" }],
    ownerHandle: "alex_demo",
    members: [
      { handle: "alex_demo", role: "Founder" },
      { handle: "ethan_park", role: "Engineer" },
      { handle: "grace_liu", role: "Designer" },
    ],
    tags: ["nextjs", "typescript", "machine-learning", "edtech", "developer-tools"],
    updates: [
      { authorHandle: "alex_demo", body: "Launched to my two intro CS sections this week. 60 people signed up in the first day, mostly from a single Discord message. Servers held, barely.", daysAgo: 21 },
      { authorHandle: "ethan_park", body: "Rewrote the transcript search to use full-text indexing instead of scanning every note. Search went from ~2s to under 100ms on the big lectures.", daysAgo: 12 },
      { authorHandle: "grace_liu", body: "Redesigned the note view so the audio scrubber stays pinned while you scroll. Small change, but three testers said it's the thing that made it click.", daysAgo: 4 },
    ],
    roles: [
      { title: "iOS Engineer", description: "We want a native iOS app so students can record and review on their phones. You'd own the app end to end — recording, offline sync, and playback. Real Swift experience required, not tutorial-following.", commitment: Commitment.STEADY, tags: ["swift", "ios"] },
      { title: "Growth Lead", description: "Help us go from two sections to two schools. You'd own campus outreach, referral loops, and figuring out which channels actually work. Comfortable talking to strangers required.", commitment: Commitment.LIGHT, tags: ["growth", "seo"] },
    ],
  },
  {
    slug: "shiftswap",
    name: "ShiftSwap",
    description: "ShiftSwap lets student workers trade hourly shifts without the group-chat chaos. Post a shift, see who can cover, get manager approval in one tap. Live on two dining halls right now.",
    stage: ProjectStage.BUILDING,
    links: [{ label: "Demo", url: "https://shiftswap.dev" }],
    ownerHandle: "priya_shah",
    members: [
      { handle: "priya_shah", role: "Founder" },
      { handle: "marcus_webb", role: "Engineer" },
      { handle: "amara_okonkwo", role: "Growth" },
    ],
    tags: ["react", "node", "postgres", "productivity"],
    updates: [
      { authorHandle: "priya_shah", body: "Swapped our auth flow to magic links after three people got locked out during finals week. Also fixed the timezone bug that made Sunday shifts show up as Monday for anyone west of Chicago.", daysAgo: 18 },
      { authorHandle: "marcus_webb", body: "Added manager approvals behind a proper role check. Took longer than it should have because I underestimated how many edge cases 'who can approve whose shift' actually has.", daysAgo: 9 },
      { authorHandle: "amara_okonkwo", body: "Ran a sign-up push at the second dining hall. 40 new workers in three days. The referral line 'stop begging in the group chat' outperformed everything else by a lot.", daysAgo: 3 },
    ],
    roles: [
      { title: "Backend Engineer", description: "Our shift-matching logic is getting gnarly and we need someone who likes untangling that. You'd own the scheduling engine and the approval workflow. Postgres and Node experience expected.", commitment: Commitment.STEADY, tags: ["node", "postgres"] },
      { title: "Mobile Developer", description: "Managers keep asking for a phone app. You'd build our first mobile client and own the on-the-go approval flow. React Native preferred so we can share logic with web.", commitment: Commitment.STEADY, tags: ["react-native"] },
    ],
  },
  {
    slug: "plotline",
    name: "Plotline",
    description: "Plotline reads a stack of research papers and gives you a plain-language map of how they connect — shared methods, contradicting results, who cites whom. Built for students drowning in a lit review.",
    stage: ProjectStage.BUILDING,
    links: [{ label: "GitHub", url: "https://github.com/plotline/plotline" }],
    ownerHandle: "maya_chen",
    members: [
      { handle: "maya_chen", role: "Founder" },
      { handle: "isabella_rossi", role: "ML Engineer" },
      { handle: "noah_berg", role: "Data" },
    ],
    tags: ["python", "pytorch", "nlp", "machine-learning", "edtech"],
    updates: [
      { authorHandle: "maya_chen", body: "Got the citation-graph extraction working on a test set of 200 papers. Precision is decent, recall is embarrassing. Next up is fixing how we parse reference sections, which are apparently held together with hope.", daysAgo: 16 },
      { authorHandle: "isabella_rossi", body: "Switched the summary model to a smaller fine-tuned one running locally. Slightly worse summaries, but it's 8x cheaper and doesn't call out to anything, which matters for the privacy story.", daysAgo: 8 },
      { authorHandle: "noah_berg", body: "Cleaned up the ingestion pipeline so a bad PDF no longer takes down the whole batch. Also added a dead-simple dashboard so we can see where papers get stuck.", daysAgo: 2 },
    ],
    roles: [
      { title: "NLP Research Assistant", description: "Help us make the paper-linking actually accurate. You'd work on reference parsing and entity resolution across papers. Comfort with transformer models and a tolerance for messy academic text required.", commitment: Commitment.HEAVY, tags: ["nlp", "pytorch", "python"] },
      { title: "Frontend Engineer", description: "The model output is good; the interface is a Jupyter notebook. You'd build the real web app where students explore the paper graph. React and a sense for information-dense UI needed.", commitment: Commitment.STEADY, tags: ["react", "typescript"] },
    ],
  },
  {
    slug: "curbside",
    name: "Curbside",
    description: "Curbside is a live map of the food trucks around campus — who's parked where, what's the wait, and when they're leaving. Crowd-sourced from students, kept honest by the truck owners themselves.",
    stage: ProjectStage.LAUNCHED,
    links: [{ label: "App", url: "https://curbside.food" }],
    ownerHandle: "deepak_nair",
    members: [
      { handle: "deepak_nair", role: "Founder" },
      { handle: "kevin_osborne", role: "Mobile" },
      { handle: "hana_kim", role: "Designer" },
    ],
    tags: ["go", "react-native", "postgres", "logistics"],
    updates: [
      { authorHandle: "deepak_nair", body: "Moved the location backend to a single Go service and killed the three Lambdas that kept cold-starting. p95 latency on the map endpoint dropped from 1.4s to 180ms.", daysAgo: 20 },
      { authorHandle: "kevin_osborne", body: "Shipped push notifications for 'your favorite truck just parked.' Opt-in rate is 70%, way higher than I expected. Turns out people really care about the birria guy.", daysAgo: 11 },
      { authorHandle: "hana_kim", body: "Ran five usability sessions on the new map filters. Everyone missed the 'open now' toggle because it looked disabled. Fixed the contrast and it stopped being a problem.", daysAgo: 5 },
    ],
    roles: [
      { title: "Growth Marketer", description: "We're strong on one campus and want a second. You'd own the playbook for launching Curbside at a new school — truck partnerships, student ambassadors, launch week. Scrappy and organized.", commitment: Commitment.LIGHT, tags: ["growth", "product-management"] },
    ],
  },
  {
    slug: "canvasly",
    name: "Canvasly",
    description: "Canvasly is a calmer place to get design critique. Drop in a screen, ask a specific question, and get structured feedback instead of a pile of drive-by comments. Still an idea, looking for a builder.",
    stage: ProjectStage.IDEA,
    links: [{ label: "Concept", url: "https://canvasly.notion.site" }],
    ownerHandle: "sofia_marino",
    members: [
      { handle: "sofia_marino", role: "Founder" },
      { handle: "grace_liu", role: "Designer" },
    ],
    tags: ["figma", "design-systems", "react", "developer-tools"],
    updates: [
      { authorHandle: "sofia_marino", body: "Interviewed 12 student designers about how they get feedback right now. The answer is 'a chaotic Discord thread' or 'nobody responds.' There's clearly a gap here — writing up the notes.", daysAgo: 14 },
      { authorHandle: "grace_liu", body: "Sketched the core critique flow. The key insight from Sofia's interviews: the person asking has to commit to a specific question, or the feedback is useless. Designing around that constraint.", daysAgo: 7 },
      { authorHandle: "sofia_marino", body: "Built a clickable Figma prototype and tested it with six people. Five of them immediately understood it. The sixth wanted it to also be Slack, which, no.", daysAgo: 2 },
    ],
    roles: [
      { title: "Founding Engineer", description: "This is an idea with real user research behind it and no code yet. You'd be the first engineer and a genuine partner in shaping it. Full-stack, comfortable with ambiguity, wants ownership. React preferred.", commitment: Commitment.HEAVY, tags: ["react", "typescript", "node"] },
    ],
  },
  {
    slug: "greenloop",
    name: "GreenLoop",
    description: "GreenLoop helps student organizations measure and cut the carbon footprint of their events — travel, catering, materials. Turns a guilty guess into an actual number you can improve on.",
    stage: ProjectStage.BUILDING,
    links: [{ label: "Site", url: "https://greenloop.eco" }],
    ownerHandle: "amara_okonkwo",
    members: [
      { handle: "amara_okonkwo", role: "Founder" },
      { handle: "lena_petrova", role: "Data" },
      { handle: "fatima_ali", role: "Engineer" },
    ],
    tags: ["python", "data-viz", "climate-tech", "sustainability"],
    updates: [
      { authorHandle: "amara_okonkwo", body: "Signed up our fourth student org — the debate team, of all people, because they travel constantly and feel bad about it. Now at 900 tracked event-attendees total.", daysAgo: 17 },
      { authorHandle: "lena_petrova", body: "Rebuilt the emissions dataset on real EPA factors instead of the back-of-envelope numbers we started with. Some estimates moved 30%, which is a little terrifying but a lot more honest.", daysAgo: 10 },
      { authorHandle: "fatima_ali", body: "Shipped the report view that org leaders actually asked for: one number up top, then the breakdown. Removed the fancy chart nobody understood. Simpler won.", daysAgo: 3 },
    ],
    roles: [
      { title: "Data Engineer", description: "Our emissions data comes from a dozen messy sources and we need someone to make it trustworthy and automated. You'd own the data pipeline and the factor database. Python and SQL required.", commitment: Commitment.STEADY, tags: ["python", "sql", "data-engineering"] },
      { title: "Frontend Developer", description: "Help us make the reports something org leaders want to share, not just tolerate. You'd own the dashboard and the public report pages. React and a feel for clear data visualization.", commitment: Commitment.LIGHT, tags: ["react", "data-viz"] },
    ],
  },
  {
    slug: "ledgerly",
    name: "Ledgerly",
    description: "Ledgerly splits shared expenses for roommates without the passive-aggressive spreadsheet. Snap a receipt, split it, settle up with a tap. Real money, real ledger, no more 'I'll get you back later.'",
    stage: ProjectStage.LAUNCHED,
    links: [{ label: "Website", url: "https://ledgerly.app" }],
    ownerHandle: "marcus_webb",
    members: [
      { handle: "marcus_webb", role: "Founder" },
      { handle: "chloe_adams", role: "Engineer" },
      { handle: "omar_haddad", role: "Engineer" },
    ],
    tags: ["node", "react", "mysql", "fintech"],
    updates: [
      { authorHandle: "marcus_webb", body: "Hit 400 signups this week, mostly from a CS Discord post. The settle-up flow via Venmo deep link is holding up, but I want a real double-entry ledger before it breaks in some way I can't undo.", daysAgo: 19 },
      { authorHandle: "omar_haddad", body: "Replaced the running-balance hack with an actual immutable transaction log. Every balance is now derived, not stored. Reconciliation bugs basically disappeared overnight.", daysAgo: 9 },
      { authorHandle: "chloe_adams", body: "Redid the receipt-split screen so you can drag amounts between people. Sounds gimmicky, tested great — splitting an uneven grocery run went from annoying to almost fun.", daysAgo: 4 },
    ],
    roles: [
      { title: "Designer", description: "We're engineers who've taken this as far as engineer-design goes. You'd own the visual and interaction design as we add group budgets. Fintech means trust — the design has to feel solid. Figma required.", commitment: Commitment.LIGHT, tags: ["figma", "ui-design"] },
    ],
  },
  {
    slug: "pitchdeck-ai",
    name: "PitchDeck AI",
    description: "PitchDeck AI reads your startup deck and gives the blunt feedback a busy investor would — what's confusing, what's missing, where the story breaks. Private beta while we make the feedback less generic.",
    stage: ProjectStage.IDEA,
    visibility: ProjectVisibility.UNLISTED,
    links: [{ label: "Waitlist", url: "https://pitchdeck.ai" }],
    ownerHandle: "noah_berg",
    members: [
      { handle: "noah_berg", role: "Founder" },
      { handle: "amara_okonkwo", role: "Growth" },
    ],
    tags: ["python", "machine-learning", "nlp", "startups"],
    updates: [
      { authorHandle: "noah_berg", body: "Fed it 30 real student pitch decks and compared its notes to what actual judges said at our startup competition. Overlap was maybe 50%. The model loves to nitpick fonts and miss the broken business model.", daysAgo: 13 },
      { authorHandle: "amara_okonkwo", body: "Talked to eight founders about whether they'd trust AI deck feedback. Split down the middle. The believers all said the same thing: they want it before they embarrass themselves in front of a human.", daysAgo: 6 },
      { authorHandle: "noah_berg", body: "Rebuilt the prompt to force the model to grade the narrative first, design last. Immediately better. Keeping it unlisted until the feedback stops being politely useless.", daysAgo: 2 },
    ],
    roles: [
      { title: "Founding Designer", description: "The product is a wall of text right now. You'd shape how blunt feedback gets delivered without making founders defensive — that's a real design problem. Early, unlisted, high-ownership. Figma and product sense.", commitment: Commitment.STEADY, tags: ["figma", "ui-design", "prototyping"] },
    ],
  },
  {
    slug: "courseflow",
    name: "CourseFlow",
    description: "CourseFlow is degree planning that isn't a spreadsheet from 2011. Map every requirement, see what unlocks what, and catch the prerequisite trap that pushes you a semester behind. Built by students who got burned.",
    stage: ProjectStage.BUILDING,
    links: [{ label: "Beta", url: "https://courseflow.study" }],
    ownerHandle: "ethan_park",
    members: [
      { handle: "ethan_park", role: "Founder" },
      { handle: "fatima_ali", role: "Engineer" },
      { handle: "nadia_hassan", role: "UX" },
    ],
    tags: ["nextjs", "prisma", "postgres", "edtech"],
    updates: [
      { authorHandle: "ethan_park", body: "Modeled prerequisites as a real DAG instead of a list of strings, which is what the registrar basically hands you. Cycle detection immediately found two impossible course chains in our own catalog.", daysAgo: 15 },
      { authorHandle: "nadia_hassan", body: "Watched eight students plan a semester in the beta. The word 'prerequisite' means nothing to a stressed sophomore at 11pm. Rewrote every label around 'you need X first' and comprehension jumped.", daysAgo: 8 },
      { authorHandle: "fatima_ali", body: "Added the 'what happens if I drop this' view. It ripples the change through your whole plan and flags what breaks. This is the feature three advisors asked us to build for them too.", daysAgo: 3 },
    ],
    roles: [
      { title: "UX Researcher", description: "We're making decisions about a stressful, high-stakes flow and we want them grounded in real student behavior. You'd run studies and turn them into design direction. Research chops and clear writing required.", commitment: Commitment.LIGHT, tags: ["ux-research"] },
      { title: "Backend Engineer", description: "The prerequisite graph and plan-validation logic is the heart of this thing and it's getting complex. You'd own the data model and the rules engine. TypeScript, Postgres, and a taste for correctness.", commitment: Commitment.STEADY, tags: ["typescript", "postgres", "prisma"] },
    ],
  },
  {
    slug: "arcade-lab",
    name: "Arcade Lab",
    description: "Arcade Lab is a home for student game jams — host a jam, submit builds that run in the browser, and let people play and vote without downloading anything. Early and unlisted while we get playback right.",
    stage: ProjectStage.IDEA,
    visibility: ProjectVisibility.UNLISTED,
    links: [{ label: "Prototype", url: "https://arcadelab.games" }],
    ownerHandle: "tyler_nguyen",
    members: [
      { handle: "tyler_nguyen", role: "Founder" },
      { handle: "omar_haddad", role: "Engineer" },
    ],
    tags: ["unity", "game-dev", "webgl", "gaming"],
    updates: [
      { authorHandle: "tyler_nguyen", body: "Ran our club's jam through a rough version of the platform. 14 teams submitted, 9 builds actually ran in-browser. The other 5 were WebGL memory limits, which is now my whole life.", daysAgo: 12 },
      { authorHandle: "omar_haddad", body: "Got voting working with a simple anti-brigading check so one team can't spam its own game to the top. Nothing fancy — rate limits and a per-account cap — but it held up during the test jam.", daysAgo: 6 },
      { authorHandle: "tyler_nguyen", body: "Shrank the average build size by pushing teams to a shared texture-compression setting. Playable-build rate went from 64% to 90%. Keeping it unlisted until that's reliably 100%.", daysAgo: 2 },
    ],
    roles: [
      { title: "Game Designer", description: "Help us design the jam experience itself — themes, constraints, how voting rewards fun over polish. You'd shape what makes a jam on Arcade Lab feel special. Game design instincts matter more than a specific engine.", commitment: Commitment.LIGHT, tags: ["game-dev"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// 4. INTRO REQUESTS + THREADS + MESSAGES
// ---------------------------------------------------------------------------

// Context is identified relative to a project the recipient owns.
type ContextRef =
  | { type: "ROLE"; projectSlug: string; roleTitle: string }
  | { type: "PROJECT"; projectSlug: string }
  | { type: "INTENT"; handle: string; intentKind: IntentKind };

type AcceptedSeed = {
  fromHandle: string;
  context: ContextRef;
  note: string;
  daysAgo: number;
  messages: { authorHandle: string; body: string }[]; // ascending order
};

const ACCEPTED_REQUESTS: AcceptedSeed[] = [
  {
    fromHandle: "ethan_park",
    context: { type: "ROLE", projectSlug: "plotline", roleTitle: "Frontend Engineer" },
    note: "Saw the Frontend Engineer role on Plotline — I've been building a degree-planning tool in Next.js and info-dense UI is exactly the problem I keep chewing on. Would love to talk about the paper-graph interface.",
    daysAgo: 14,
    messages: [
      { authorHandle: "ethan_park", body: "Thanks for accepting! I'm curious how you're rendering the citation graph right now — is it all client-side or are you precomputing layout on the backend?" },
      { authorHandle: "maya_chen", body: "Right now it's a Jupyter notebook and a lot of imagination, honestly. Backend spits out nodes and edges as JSON, no layout at all yet. That's basically the whole job." },
      { authorHandle: "ethan_park", body: "Perfect, that's the fun part. I'd probably start with a force-directed layout and then let people pin nodes. Are the graphs usually under a few hundred nodes or can they blow up?" },
      { authorHandle: "maya_chen", body: "A lit review is usually 50-300 papers, so it's tractable. Want to hop on a call this week? I can walk you through the data shape and where it's messy." },
      { authorHandle: "ethan_park", body: "Yes — Thursday afternoon works for me. I'll come with a rough prototype so we have something concrete to argue about." },
    ],
  },
  {
    fromHandle: "kevin_osborne",
    context: { type: "ROLE", projectSlug: "shiftswap", roleTitle: "Mobile Developer" },
    note: "The Mobile Developer role on ShiftSwap lines up perfectly with what I did on Curbside — React Native, on-the-go approvals, all of it. Managers wanting a phone app is a story I've lived. Would love to help.",
    daysAgo: 12,
    messages: [
      { authorHandle: "kevin_osborne", body: "Appreciate you accepting! Quick question up front — are you hoping to share code between the web app and mobile, or build the mobile client fresh?" },
      { authorHandle: "priya_shah", body: "Ideally share the shift-matching logic at least. The web app is React so I was hoping React Native would let us reuse the core hooks. Is that realistic or am I dreaming?" },
      { authorHandle: "kevin_osborne", body: "Mostly realistic. The pure logic and API layer share fine; the UI won't. I'd pull the matching logic into a plain TS package both can import. Want me to sketch that structure?" },
      { authorHandle: "priya_shah", body: "That would be amazing. If you can put together a rough plan I'll get you access to the repo and the staging backend." },
    ],
  },
  {
    fromHandle: "fatima_ali",
    context: { type: "ROLE", projectSlug: "greenloop", roleTitle: "Frontend Developer" },
    note: "GreenLoop's mission is exactly the kind of thing I want to build. I'm a full-stack Python dev drifting toward the frontend, and 'make the report something people want to share' is a challenge I'd take seriously.",
    daysAgo: 11,
    messages: [
      { authorHandle: "fatima_ali", body: "Thanks Amara! I read that update about cutting the fancy chart nobody understood — that resonated. What does the current report page look like?" },
      { authorHandle: "amara_okonkwo", body: "Right now it's one big number and a table. Functional, ugly. Org leaders want to post their results to their group, so it needs to look good enough to screenshot proudly." },
      { authorHandle: "fatima_ali", body: "Got it — so a shareable public report page is really the goal, not just an internal dashboard. That changes the priorities a lot. I have some ideas for a clean summary card." },
      { authorHandle: "amara_okonkwo", body: "Exactly. Let's start there. I'll add you to the repo and share the three reports leaders have actually screenshotted so far so you can see what they're proud of." },
    ],
  },
  {
    fromHandle: "grace_liu",
    context: { type: "PROJECT", projectSlug: "canvasly" },
    note: "Canvasly is the tool I've wanted every time I've begged for feedback in a dead Discord thread. I'm a designer who codes a bit and cares about design systems — I'd love to help shape it beyond the prototype.",
    daysAgo: 10,
    messages: [
      { authorHandle: "grace_liu", body: "So happy you accepted — I've been quietly obsessed with this problem too. What's the biggest open question in the design right now?" },
      { authorHandle: "sofia_marino", body: "Honestly it's how much structure to force. Too little and you get drive-by 'looks good.' Too much and people bounce before submitting. Where's the line?" },
      { authorHandle: "grace_liu", body: "I think the line is one required question and everything else optional. Make the asker commit to what they actually want judged, then get out of the way. We could test that against your six interviews." },
      { authorHandle: "sofia_marino", body: "That's basically the insight I landed on too, which is reassuring. Let's pair on a proper flow this weekend — I'll share the Figma and the interview notes." },
    ],
  },
  {
    fromHandle: "omar_haddad",
    context: { type: "PROJECT", projectSlug: "ledgerly" },
    note: "I read your update about moving Ledgerly to an immutable transaction log — that's exactly the kind of correctness-first thinking I care about. I've done a lot of on-chain ledger work and I'd love to compare approaches.",
    daysAgo: 9,
    messages: [
      { authorHandle: "omar_haddad", body: "Thanks for accepting! Your double-entry rewrite caught my eye. Did you go with a true debit/credit model or a simpler append-only log with derived balances?" },
      { authorHandle: "marcus_webb", body: "Append-only log with derived balances. I considered full double-entry but it felt like overkill for roommate splits. Curious if you think that'll bite us later." },
      { authorHandle: "omar_haddad", body: "For your scale it's fine. The place it bites is multi-currency and refunds — that's where double-entry earns its keep. If you never do those, don't add the complexity." },
      { authorHandle: "marcus_webb", body: "That's reassuring, thanks. No multi-currency plans. Would you be up for reviewing the reconciliation code sometime? A second set of eyes on the money path would help me sleep." },
      { authorHandle: "omar_haddad", body: "Happy to. Send me the repo link and I'll do a pass this week." },
    ],
  },
  {
    fromHandle: "alex_demo",
    context: { type: "ROLE", projectSlug: "curbside", roleTitle: "Growth Marketer" },
    note: "I run NoteMesh and I'm about to try launching at a second school — your Curbside 'one campus to two' playbook is exactly what I don't know how to do yet. Would love to swap notes on campus launches even though I'm not applying.",
    daysAgo: 8,
    messages: [
      { authorHandle: "alex_demo", body: "Thanks Deepak! I know I'm not exactly a growth-marketer applicant — I mostly wanted to learn how you're thinking about the second-campus launch. NoteMesh is stuck at one." },
      { authorHandle: "deepak_nair", body: "Ha, no worries, happy to trade. The single biggest thing for us: find the one obsessed student on the new campus before you launch, not after. They do more than any ad." },
      { authorHandle: "alex_demo", body: "That's such a good reframe. I've been thinking channels-first when I should be thinking people-first. How'd you find that person at the second school?" },
      { authorHandle: "deepak_nair", body: "Posted in the campus subreddit asking who complains most about food-truck timing. The angriest reply became our ambassador. Anger is underrated signal." },
      { authorHandle: "alex_demo", body: "Amazing. I'm going to go find the person most furious about lecture notes. Thanks — this genuinely unblocked me." },
    ],
  },
  {
    fromHandle: "nadia_hassan",
    context: { type: "ROLE", projectSlug: "courseflow", roleTitle: "UX Researcher" },
    note: "CourseFlow's UX Researcher role is almost exactly the work I most want to do — high-stakes, stressful flow, real students. I read your note about 'prerequisite' meaning nothing at 11pm and I've seen the same thing. Let's talk.",
    daysAgo: 7,
    messages: [
      { authorHandle: "nadia_hassan", body: "Thanks Ethan! That prerequisite-comprehension finding you posted is exactly the kind of thing I love chasing. How are you currently deciding what to study?" },
      { authorHandle: "ethan_park", body: "Very unscientifically — I watch someone use it and write down where they get stuck. It works but it doesn't scale and I know I'm cherry-picking. That's why I want a real researcher." },
      { authorHandle: "nadia_hassan", body: "That's a great starting instinct, honestly. I'd formalize it into a short recurring study with the same tasks so you can see if changes actually move comprehension. Want me to draft a protocol?" },
      { authorHandle: "ethan_park", body: "Please. If you can put together a lightweight study plan I'll recruit five beta students for this week." },
    ],
  },
  {
    fromHandle: "sam_torres",
    context: { type: "ROLE", projectSlug: "greenloop", roleTitle: "Data Engineer" },
    note: "GreenLoop's Data Engineer role is right in my wheelhouse — messy multi-source data that needs to become trustworthy and automated is my favorite kind of problem. I've built pipelines on exactly this stack. Would love to help.",
    daysAgo: 6,
    messages: [
      { authorHandle: "sam_torres", body: "Thanks for accepting, Amara! Lena's update about rebuilding on real EPA factors caught my attention. Is the factor data updated by hand right now?" },
      { authorHandle: "amara_okonkwo", body: "Painfully by hand, yes. Lena updates a spreadsheet and we import it. It works until she's busy, and then it doesn't. Automating that is basically the whole role." },
      { authorHandle: "sam_torres", body: "That's very fixable. I'd set up a versioned source for the factors with a validation step so a bad update can't silently corrupt everyone's numbers. Trust is the real deliverable here." },
      { authorHandle: "amara_okonkwo", body: "'Trust is the deliverable' — yes, that's exactly it. Let me connect you with Lena so you two can look at the current pipeline together." },
    ],
  },
];

const PENDING_TO_DEMO: { fromHandle: string; context: ContextRef; note: string; daysAgo: number }[] = [
  {
    fromHandle: "liam_osei",
    context: { type: "ROLE", projectSlug: "notemesh", roleTitle: "iOS Engineer" },
    note: "The NoteMesh iOS Engineer role is exactly what I want to build. I've shipped a SwiftUI habit tracker with a few thousand downloads and I'm dying to own recording, offline sync, and playback end to end. Can we talk?",
    daysAgo: 5,
  },
  {
    fromHandle: "amara_okonkwo",
    context: { type: "ROLE", projectSlug: "notemesh", roleTitle: "Growth Lead" },
    note: "I took a campus sustainability app from zero to 900 signups on basically no budget, and 'two sections to two schools' is the exact problem I love. I'd bring a real channel-testing playbook to the NoteMesh Growth Lead role.",
    daysAgo: 4,
  },
  {
    fromHandle: "noah_berg",
    context: { type: "PROJECT", projectSlug: "notemesh" },
    note: "Not applying to a specific role — I just think NoteMesh is genuinely useful and I'm building an AI feedback tool in an adjacent space. Would love to compare notes on how you handle transcription quality and student privacy.",
    daysAgo: 3,
  },
  {
    fromHandle: "maya_chen",
    context: { type: "INTENT", handle: "alex_demo", intentKind: IntentKind.FEEDBACK },
    note: "You mentioned you're happy to trade product feedback on early student tools — I'd love to take you up on that. Plotline is at the stage where I can't tell if the interface is confusing or if I've just stared at it too long.",
    daysAgo: 2,
  },
  {
    fromHandle: "kevin_osborne",
    context: { type: "ROLE", projectSlug: "notemesh", roleTitle: "iOS Engineer" },
    note: "I know the NoteMesh iOS role asks for Swift specifically and I'm primarily React Native — but I'm learning Swift fast and I've shipped real mobile apps to real users. If you'd consider a hybrid approach, I'd love to make the case.",
    daysAgo: 1,
  },
];

// ---------------------------------------------------------------------------
// 5. PROFILE POSTS
// ---------------------------------------------------------------------------

// Posts are seeded WITHOUT media, on purpose. A photo or video only exists here
// by way of a real upload — POST /api/media validates the file and stores the
// bytes — so fabricating MediaAsset rows would have the demo dataset assert a
// capability nothing had actually exercised, and a broken byte would surface as
// a broken player rather than as a failed seed. Attach a file in the composer to
// see that path end to end.
//
// The timestamps below are chosen to interleave with the project updates (2-21
// days ago) and the open roles, since the point of the merged feed is that all
// three item types show up mixed together on first load.
type PostSeed = { handle: string; body: string; daysAgo: number; hoursAgo?: number };

const POSTS: PostSeed[] = [
  {
    handle: "alex_demo",
    body: "Watched someone open NoteMesh for the first time with no explanation from me. They tried to search before uploading anything, then sat there for a full minute. The empty state never tells you what to do first. Fixing that tonight.",
    daysAgo: 1,
    hoursAgo: 3,
  },
  {
    handle: "maya_chen",
    body: "Note to past me: a PDF is not a document, it's a crime scene. Spent today writing a reference parser for a format with no rules. It works on 84% of the test set and I am choosing to call that a win.",
    daysAgo: 2,
  },
  {
    handle: "priya_shah",
    body: "Ran my first real migration against a live database today. Backed everything up three times, ran it, then stared at the logs for twenty minutes waiting for something to break. Nothing broke. I still don't trust it.",
    daysAgo: 3,
    hoursAgo: 4,
  },
  {
    handle: "alex_demo",
    body: "The hardest part of building for students isn't the code, it's getting fifteen people to open a link. I wrote a few thousand lines this month and the thing that actually moved the numbers was one well-timed Discord message.",
    daysAgo: 5,
  },
  {
    handle: "grace_liu",
    body: "Drew 40 empty-state illustrations this weekend for a component library nobody asked for. Do I regret it? No. Will I use more than six of them? Also no.",
    daysAgo: 6,
    hoursAgo: 3,
  },
  {
    handle: "deepak_nair",
    body: "Load-tested the Curbside map endpoint at 10x our real traffic just to find where it falls over. It didn't. Mildly annoyed — I had cleared the whole evening to fix something.",
    daysAgo: 7,
  },
  {
    handle: "tyler_nguyen",
    body: "Ran the club game jam this weekend. 14 teams, 48 hours, and one team that spent 40 of those hours on a menu screen. Their menu is genuinely the best thing anyone made.",
    daysAgo: 9,
    hoursAgo: 5,
  },
  {
    handle: "sofia_marino",
    body: "Every design portfolio I see is polished final screens. Nobody posts the eleven versions before it. My honest ratio is about one good screen per eleven bad ones, and the bad ones are where all the thinking happened.",
    daysAgo: 10,
  },
  {
    handle: "marcus_webb",
    body: "Someone found a bug where splitting $0.01 three ways in Ledgerly quietly loses a penny. It has been live for four months. Four months of pennies evaporating. Fixed now, and I am afraid of floating point in an entirely new way.",
    daysAgo: 13,
  },
  {
    handle: "hana_kim",
    body: "Bribed six people with coffee to use a prototype for ten minutes each. Cost me $27 and it stopped us building a feature nobody wanted. Best money this project has spent.",
    daysAgo: 15,
    hoursAgo: 2,
  },
  {
    handle: "noah_berg",
    body: "Spent the week convincing a model to stop complimenting people's fonts and start questioning their revenue model. Being useful and being nice turn out to be in direct tension, and I have to pick one.",
    daysAgo: 17,
  },
  {
    handle: "yuki_tanaka",
    body: "The sensor board finally talked to the cloud backend. Three weeks. The bug was a byte-order mismatch I had 'already checked' four separate times.",
    daysAgo: 19,
    hoursAgo: 6,
  },
  {
    handle: "chloe_adams",
    body: "Rewrote a component in React to prove I could, and it took four hours to do what takes me twenty minutes in Vue. Losing framework arguments is much easier when you're simply bad at the other one.",
    daysAgo: 22,
  },
];

// ---------------------------------------------------------------------------
// SEED RUNNER
// ---------------------------------------------------------------------------

async function wipe() {
  // FK-safe order: children before parents.
  await prisma.message.deleteMany();
  await prisma.threadMember.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.introRequest.deleteMany();
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  // MediaAsset before Post: an asset points at the post it was attached to.
  await prisma.mediaAsset.deleteMany();
  await prisma.post.deleteMany();
  await prisma.update.deleteMany();
  await prisma.roleTag.deleteMany();
  await prisma.openRole.deleteMany();
  await prisma.projectTag.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.intent.deleteMany();
  await prisma.profileTag.deleteMany();
  await prisma.project.deleteMany();
  await prisma.tagSuggestion.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.profile.deleteMany();
  // School has no FK to anything — Profile.school is free text — so it can go
  // any time after the profiles that named the schools.
  await prisma.school.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

// Refuse to wipe unless we are demonstrably in a schema meant to be wiped.
//
// wipe() deletes every row in the database it is pointed at, and the only thing
// standing between it and real user data is the `schema=` parameter in the URL.
// That is carried by the connection's search_path, and a transaction pooler does
// not preserve it under concurrency — a measured run of 12 concurrent
// `SELECT current_schema()` through port 6543 came back as a mix of
// ["hatch_e2e", "public"]. Asking the database where it actually landed, rather
// than trusting the URL we think we passed, is the difference between a failed
// seed and a deleted production table.
//
// SEED_ALLOW_PUBLIC=1 is the deliberate escape hatch for seeding a genuinely
// disposable database whose default schema is public.
async function assertSafeToWipe() {
  const rows = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  const schema = rows[0]?.schema ?? "unknown";

  if (schema !== "public") {
    console.log(`[HATCH seed] target schema: ${schema}`);
    return;
  }
  if (process.env.SEED_ALLOW_PUBLIC === "1") {
    console.log("[HATCH seed] target schema: public (allowed via SEED_ALLOW_PUBLIC=1)");
    return;
  }

  console.error(
    "\n[HATCH seed] REFUSING TO WIPE.\n" +
      "  Connected schema is 'public', which is where real data lives.\n" +
      "  The e2e suite must run via `npm run test:e2e`, which points DATABASE_URL\n" +
      "  at an isolated schema on the SESSION pooler (port 5432).\n" +
      "  If DATABASE_URL uses port 6543 (pgbouncer/transaction mode), the schema\n" +
      "  isolation is not reliable — see scripts/with-e2e-db.mjs.\n" +
      "  To seed a genuinely disposable public-schema database, set SEED_ALLOW_PUBLIC=1.\n"
  );
  process.exit(1);
}

async function main() {
  await assertSafeToWipe();
  console.log("[HATCH seed] wiping database...");
  await wipe();

  // --- Tags ---
  const tagId = new Map<string, string>();
  for (const t of TAGS) {
    const row = await prisma.tag.create({
      data: { slug: t.slug, label: t.label, kind: t.kind, aliases: t.aliases },
    });
    tagId.set(t.slug, row.id);
  }
  console.log(`[HATCH seed] created ${TAGS.length} tags`);

  // --- School catalog ---
  // Every school the seeded profiles attend, so a fresh signup gets a working
  // type-ahead instead of an empty dropdown. In production this table grows the
  // same way, one ensureSchool() call at a time.
  const schoolNames = [...new Set(USERS.map((u) => u.school))].sort();
  for (const name of schoolNames) {
    await prisma.school.create({ data: { slug: catalogSlug(name), name } });
  }
  console.log(`[HATCH seed] created ${schoolNames.length} schools`);

  // --- Users + profiles ---
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
  const profileId = new Map<string, string>(); // handle -> profileId
  const intentId = new Map<string, string>(); // `${handle}::${kind}` -> intentId
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        // Each user gets its own bcrypt call so hashes are independently salted.
        passwordHash: await bcrypt.hash(PASSWORD, BCRYPT_COST),
        emailVerifiedAt: ago(60),
        isAdmin: u.isAdmin ?? false,
        createdAt: ago(60),
      },
    });
    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        handle: u.handle,
        name: u.name,
        school: u.school,
        gradYear: u.gradYear,
        basedIn: BASED_IN_OVERRIDES[u.handle] ?? CAMPUS_CITY[u.school] ?? "",
        bio: u.bio,
        links: u.links,
        avatarSeed: `${u.handle}-${Math.random().toString(36).slice(2, 10)}`,
        isDiscoverable: u.isDiscoverable ?? true,
        handleChangedAt: ago(60),
        onboardedAt: ago(59),
      },
    });
    profileId.set(u.handle, profile.id);

    for (const skill of u.skills) {
      await prisma.profileTag.create({
        data: { profileId: profile.id, tagId: tagId.get(skill)!, relation: TagRelation.HAS },
      });
    }
    for (const learn of u.learning) {
      await prisma.profileTag.create({
        data: { profileId: profile.id, tagId: tagId.get(learn)!, relation: TagRelation.LEARNING },
      });
    }
    for (const intent of u.intents) {
      const row = await prisma.intent.create({
        data: { profileId: profile.id, kind: intent.kind, note: intent.note },
      });
      intentId.set(`${u.handle}::${intent.kind}`, row.id);
    }
  }
  void passwordHash; // reference kept for clarity; per-user hashing used above
  console.log(`[HATCH seed] created ${USERS.length} users with complete profiles`);

  // --- Projects ---
  const projectId = new Map<string, string>(); // slug -> projectId
  const projectOwner = new Map<string, string>(); // slug -> owner handle
  const roleId = new Map<string, string>(); // `${slug}::${title}` -> openRoleId
  let roleCount = 0;
  let updateCount = 0;
  for (const p of PROJECTS) {
    const project = await prisma.project.create({
      data: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        stage: p.stage,
        visibility: p.visibility ?? ProjectVisibility.PUBLIC,
        links: p.links,
        createdById: profileId.get(p.ownerHandle)!,
        createdAt: ago(30),
      },
    });
    projectId.set(p.slug, project.id);
    projectOwner.set(p.slug, p.ownerHandle);

    for (const m of p.members) {
      await prisma.membership.create({
        data: {
          projectId: project.id,
          profileId: profileId.get(m.handle)!,
          role: m.role,
          isOwner: m.handle === p.ownerHandle,
        },
      });
    }
    for (const slug of p.tags) {
      await prisma.projectTag.create({ data: { projectId: project.id, tagId: tagId.get(slug)! } });
    }
    for (const up of p.updates) {
      await prisma.update.create({
        data: {
          projectId: project.id,
          authorProfileId: profileId.get(up.authorHandle)!,
          body: up.body,
          createdAt: ago(up.daysAgo),
        },
      });
      updateCount++;
    }
    for (const r of p.roles) {
      const role = await prisma.openRole.create({
        data: {
          projectId: project.id,
          title: r.title,
          description: r.description,
          commitment: r.commitment,
          status: r.status ?? RoleStatus.OPEN,
          createdAt: ago(25),
        },
      });
      roleId.set(`${p.slug}::${r.title}`, role.id);
      for (const slug of r.tags) {
        await prisma.roleTag.create({ data: { openRoleId: role.id, tagId: tagId.get(slug)! } });
      }
      roleCount++;
    }
  }
  console.log(`[HATCH seed] created ${PROJECTS.length} projects, ${roleCount} open roles, ${updateCount} updates`);

  // --- Profile posts (text only — see the note on POSTS) ---
  for (const p of POSTS) {
    await prisma.post.create({
      data: {
        authorProfileId: profileId.get(p.handle)!,
        body: p.body,
        createdAt: ago(p.daysAgo, p.hoursAgo ?? 0),
      },
    });
  }
  console.log(`[HATCH seed] created ${POSTS.length} profile posts`);

  // Resolve a ContextRef to (contextType, contextId, recipient handle).
  function resolveContext(ctx: ContextRef): { type: ContextType; id: string; toHandle: string } {
    if (ctx.type === "ROLE") {
      return {
        type: ContextType.ROLE,
        id: roleId.get(`${ctx.projectSlug}::${ctx.roleTitle}`)!,
        toHandle: projectOwner.get(ctx.projectSlug)!,
      };
    }
    if (ctx.type === "PROJECT") {
      return { type: ContextType.PROJECT, id: projectId.get(ctx.projectSlug)!, toHandle: projectOwner.get(ctx.projectSlug)! };
    }
    return { type: ContextType.INTENT, id: intentId.get(`${ctx.handle}::${ctx.intentKind}`)!, toHandle: ctx.handle };
  }

  // --- Accepted requests -> threads -> messages ---
  let threadCount = 0;
  let messageCount = 0;
  for (const a of ACCEPTED_REQUESTS) {
    const ctx = resolveContext(a.context);
    const fromId = profileId.get(a.fromHandle)!;
    const toId = profileId.get(ctx.toHandle)!;
    const request = await prisma.introRequest.create({
      data: {
        fromProfileId: fromId,
        toProfileId: toId,
        contextType: ctx.type,
        contextId: ctx.id,
        note: a.note,
        status: RequestStatus.ACCEPTED,
        createdAt: ago(a.daysAgo),
        respondedAt: ago(a.daysAgo, -6), // responded ~6h after sending
      },
    });
    const thread = await prisma.thread.create({
      data: {
        introRequestId: request.id,
        contextType: ctx.type,
        contextId: ctx.id,
        createdAt: ago(a.daysAgo, -6),
        members: {
          create: [
            { profileId: fromId, lastReadAt: ago(a.daysAgo, -6) },
            { profileId: toId, lastReadAt: ago(a.daysAgo, -6) },
          ],
        },
      },
    });
    threadCount++;
    // Messages ascending, spaced out over the hours after the thread opened.
    let offsetHours = -6;
    for (const m of a.messages) {
      offsetHours -= 2;
      await prisma.message.create({
        data: {
          threadId: thread.id,
          authorProfileId: profileId.get(m.authorHandle)!,
          body: m.body,
          createdAt: ago(a.daysAgo, offsetHours),
        },
      });
      messageCount++;
    }
  }
  console.log(`[HATCH seed] created ${ACCEPTED_REQUESTS.length} accepted requests, ${threadCount} threads, ${messageCount} messages`);

  // --- Pending inbound requests for the demo account ---
  for (const p of PENDING_TO_DEMO) {
    const ctx = resolveContext(p.context);
    await prisma.introRequest.create({
      data: {
        fromProfileId: profileId.get(p.fromHandle)!,
        toProfileId: profileId.get(ctx.toHandle)!,
        contextType: ctx.type,
        contextId: ctx.id,
        note: p.note,
        status: RequestStatus.PENDING,
        createdAt: ago(p.daysAgo),
      },
    });
  }
  console.log(`[HATCH seed] created ${PENDING_TO_DEMO.length} pending inbound requests for the demo account`);

  console.log(`
--------------------------------------------------------------------
[HATCH seed] Demo account:   demo@stateu.edu / ${PASSWORD}
[HATCH seed] Admin account:  admin@hatchdemo.edu / ${PASSWORD}
[HATCH seed] All seeded users share password: ${PASSWORD}
--------------------------------------------------------------------
`);
}

main()
  .catch((e) => {
    console.error("[HATCH seed] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
