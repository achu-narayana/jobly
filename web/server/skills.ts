/**
 * Local skill dictionary. Matching is pure text, no models.
 * Each entry: canonical id, label, category, aliases (lowercase, matched as whole words).
 */
export interface SkillDef {
  id: string;
  label: string;
  category: string;
  aliases: string[];
}

const S = (id: string, label: string, category: string, ...aliases: string[]): SkillDef => ({
  id,
  label,
  category,
  aliases: [label.toLowerCase(), ...aliases],
});

export const SKILLS: SkillDef[] = [
  // Languages
  S("typescript", "TypeScript", "language", "ts"),
  S("javascript", "JavaScript", "language", "js", "es6", "ecmascript"),
  S("python", "Python", "language", "py"),
  S("java", "Java", "language"),
  S("kotlin", "Kotlin", "language"),
  S("swift", "Swift", "language"),
  S("go", "Go", "language", "golang"),
  S("rust", "Rust", "language"),
  S("csharp", "C#", "language", "c#", ".net", "dotnet", "asp.net"),
  S("cpp", "C++", "language", "c++"),
  S("c", "C", "language"),
  S("ruby", "Ruby", "language", "rails", "ruby on rails"),
  S("php", "PHP", "language", "laravel", "symfony"),
  S("scala", "Scala", "language"),
  S("r", "R", "language", "r language", "rstudio"),
  S("sql", "SQL", "language"),
  S("bash", "Bash", "language", "shell scripting", "shell"),
  S("dart", "Dart", "language", "flutter"),
  S("elixir", "Elixir", "language", "phoenix"),
  S("solidity", "Solidity", "language"),
  // Frontend
  S("react", "React", "frontend", "reactjs", "react.js"),
  S("nextjs", "Next.js", "frontend", "next.js", "nextjs", "next"),
  S("vue", "Vue", "frontend", "vuejs", "vue.js", "nuxt"),
  S("angular", "Angular", "frontend", "angularjs"),
  S("svelte", "Svelte", "frontend", "sveltekit"),
  S("html", "HTML", "frontend", "html5"),
  S("css", "CSS", "frontend", "css3", "scss", "sass", "less"),
  S("tailwind", "Tailwind", "frontend", "tailwindcss", "tailwind css"),
  S("redux", "Redux", "frontend", "zustand", "mobx"),
  S("webpack", "Webpack", "frontend", "vite", "rollup", "esbuild"),
  S("threejs", "Three.js", "frontend", "three.js", "webgl", "react three fiber"),
  S("d3", "D3", "frontend", "d3.js"),
  S("storybook", "Storybook", "frontend"),
  S("accessibility", "Accessibility", "frontend", "a11y", "wcag"),
  S("figma", "Figma", "design", "sketch", "adobe xd"),
  S("ux", "UX Design", "design", "ux", "ui/ux", "user experience", "ui design"),
  // Backend
  S("node", "Node.js", "backend", "node", "nodejs", "node.js"),
  S("express", "Express", "backend", "expressjs", "express.js", "koa", "hono", "fastify"),
  S("nestjs", "NestJS", "backend", "nest.js", "nest"),
  S("django", "Django", "backend"),
  S("flask", "Flask", "backend", "fastapi"),
  S("spring", "Spring", "backend", "spring boot", "springboot"),
  S("graphql", "GraphQL", "backend", "apollo"),
  S("rest", "REST APIs", "backend", "rest", "restful", "rest api", "rest apis", "api design"),
  S("grpc", "gRPC", "backend", "protobuf"),
  S("microservices", "Microservices", "backend", "microservice", "service-oriented"),
  S("websockets", "WebSockets", "backend", "websocket", "socket.io"),
  // Data
  S("postgres", "PostgreSQL", "data", "postgresql", "postgres"),
  S("mysql", "MySQL", "data", "mariadb"),
  S("mongodb", "MongoDB", "data", "mongo"),
  S("redis", "Redis", "data"),
  S("elasticsearch", "Elasticsearch", "data", "opensearch", "elastic"),
  S("kafka", "Kafka", "data", "apache kafka", "rabbitmq", "pub/sub", "message queue"),
  S("spark", "Spark", "data", "apache spark", "pyspark"),
  S("airflow", "Airflow", "data", "apache airflow", "dagster", "prefect"),
  S("dbt", "dbt", "data"),
  S("snowflake", "Snowflake", "data", "bigquery", "redshift", "databricks"),
  S("pandas", "Pandas", "data", "numpy"),
  S("etl", "ETL", "data", "elt", "data pipelines", "data pipeline"),
  S("data-modeling", "Data Modeling", "data", "data modelling", "data warehouse", "data warehousing"),
  S("hadoop", "Hadoop", "data", "hive", "hdfs"),
  S("sqlite", "SQLite", "data"),
  S("dynamodb", "DynamoDB", "data", "cassandra"),
  S("prisma", "Prisma", "data", "drizzle", "typeorm", "sequelize", "sqlalchemy", "hibernate"),
  // ML / AI
  S("ml", "Machine Learning", "ai", "machine learning", "ml"),
  S("deep-learning", "Deep Learning", "ai", "neural networks", "neural network"),
  S("pytorch", "PyTorch", "ai", "torch"),
  S("tensorflow", "TensorFlow", "ai", "keras"),
  S("sklearn", "scikit-learn", "ai", "scikit-learn", "sklearn"),
  S("llm", "LLMs", "ai", "llm", "llms", "large language models", "gpt", "langchain", "rag", "prompt engineering"),
  S("nlp", "NLP", "ai", "natural language processing"),
  S("cv", "Computer Vision", "ai", "opencv", "image processing"),
  S("mlops", "MLOps", "ai", "mlflow", "model deployment"),
  S("statistics", "Statistics", "ai", "statistical", "a/b testing", "experimentation"),
  // Cloud / infra
  S("aws", "AWS", "cloud", "amazon web services", "ec2", "s3", "lambda"),
  S("gcp", "GCP", "cloud", "google cloud"),
  S("azure", "Azure", "cloud", "microsoft azure"),
  S("cloudflare", "Cloudflare", "cloud", "cloudflare workers", "workers"),
  S("docker", "Docker", "infra", "containers", "containerization"),
  S("kubernetes", "Kubernetes", "infra", "k8s", "helm"),
  S("terraform", "Terraform", "infra", "pulumi", "infrastructure as code", "iac"),
  S("cicd", "CI/CD", "infra", "ci/cd", "github actions", "jenkins", "gitlab ci", "circleci"),
  S("linux", "Linux", "infra", "unix"),
  S("nginx", "Nginx", "infra", "load balancing"),
  S("monitoring", "Observability", "infra", "prometheus", "grafana", "datadog", "observability", "monitoring"),
  S("serverless", "Serverless", "cloud"),
  // Mobile
  S("react-native", "React Native", "mobile", "react native", "expo"),
  S("ios", "iOS", "mobile", "swiftui", "uikit"),
  S("android", "Android", "mobile", "jetpack compose"),
  // Testing / quality
  S("testing", "Testing", "quality", "unit testing", "jest", "vitest", "pytest", "junit", "tdd", "test-driven"),
  S("e2e", "E2E Testing", "quality", "cypress", "playwright", "selenium"),
  S("security", "Security", "quality", "owasp", "appsec", "penetration testing", "cybersecurity"),
  // Practices / tools
  S("git", "Git", "tools", "github", "gitlab", "version control"),
  S("agile", "Agile", "practice", "scrum", "kanban"),
  S("system-design", "System Design", "practice", "distributed systems", "scalability", "architecture"),
  S("performance", "Performance", "practice", "performance optimization", "optimisation"),
  S("leadership", "Leadership", "practice", "mentoring", "mentored", "team lead", "led a team"),
  S("product", "Product Thinking", "practice", "product management", "roadmap", "stakeholders"),
  S("communication", "Communication", "practice", "cross-functional", "collaboration"),
  S("jira", "Jira", "tools", "confluence"),
  S("excel", "Excel", "tools", "google sheets", "spreadsheets"),
  S("powerbi", "Power BI", "tools", "tableau", "looker", "metabase"),
  S("blockchain", "Blockchain", "domain", "web3", "ethereum", "smart contracts"),
  S("fintech", "Fintech", "domain", "payments", "trading", "banking"),
  S("ecommerce", "E-commerce", "domain", "shopify", "retail"),
  S("healthcare", "Healthcare", "domain", "healthtech", "medical"),
  S("gaming", "Gaming", "domain", "unity", "unreal", "game development"),
  S("iot", "IoT", "domain", "embedded", "firmware"),
  S("devops", "DevOps", "infra", "sre", "site reliability"),
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pre-compiled whole-word regexes per skill. Symbols like C++ / C# / .NET need custom boundaries. */
const COMPILED = SKILLS.map((def) => ({
  def,
  re: new RegExp(
    `(?<![\\w+#.])(?:${def.aliases.map(escape).join("|")})(?![\\w+#])`,
    "gi",
  ),
}));

export interface SkillCount {
  def: SkillDef;
  count: number;
}

/** Count every skill mention in a block of text. */
export function countSkills(text: string): SkillCount[] {
  const out: SkillCount[] = [];
  for (const { def, re } of COMPILED) {
    re.lastIndex = 0;
    const count = (text.match(re) ?? []).length;
    if (count > 0) out.push({ def, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

export const skillById = new Map(SKILLS.map((s) => [s.id, s]));
