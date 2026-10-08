// Single source of truth for everything the site says.
// Used by the terminal (runtime) and by the static HTML rendered at build time (SEO / no-JS).

export type Lang = "pt" | "en";
export type L = Record<Lang, string>;

export interface Link {
  label: string;
  url: string;
}

/** A step inside a job, for the detailed view (a promotion, a role change). */
export interface JobStep {
  title: L;
  period: L;
  text: L;
}

/** The longer version of a job, shown by `experiencia <slug>`; the resume keeps the summary. */
export interface JobDetails {
  intro: L;
  steps?: JobStep[];
  bullets?: L[];
  stack?: string[];
}

export interface Job {
  /** Short name for `experiencia <slug>`. */
  slug: string;
  company: string;
  role: L;
  period: L;
  place: L;
  /** One line on what the company is and what the role was about, read before the bullets. */
  about?: L;
  bullets: L[];
  stack?: string[];
  details?: JobDetails;
}

export interface Project {
  name: string;
  /** Brand mark served from /public. */
  logo: string;
  url: string;
  /** Since when, like a job's period. */
  period: L;
  /** Where it stands; closes the context line. */
  status: L;
  role: L;
  tagline: L;
  description: L;
  highlights: L[];
  stack: string[];
}

export interface StackGroup {
  group: L;
  items: string[];
}

export interface Course {
  school: string;
  degree: L;
  period: string;
}

export const profile = {
  name: "Pedro Henrique",
  role: {
    pt: "Engenheiro de Software Sênior",
    en: "Senior Software Engineer",
  } satisfies L,
  location: {
    pt: "Belo Horizonte, Brasil",
    en: "Belo Horizonte, Brazil",
  } satisfies L,
  summary: {
    pt: "Nove anos construindo software em C# e .NET, hoje com foco em arquitetura e produto. Penso como dono: entendo o problema do negócio, desenho a solução e acompanho até ela rodar em produção.",
    en: "Nine years building software in C# and .NET, now focused on architecture and product. I think like an owner: I understand the business problem, design the solution and stay with it until it runs in production.",
  } satisfies L,
  now: {
    pt: "Na Paysign, defino a base das novas APIs e os padrões técnicos da empresa. Por conta própria, criei sozinho dois SaaS, ambos em produção com clientes beta: o Vittz, para clínicas, e o iFleetHub, para transportadoras. Antes, ajudei a construir um banco digital no Canadá e plataformas do varejo brasileiro.",
    en: "At Paysign I define the foundation of new APIs and the company's technical standards. On my own, I built two SaaS products, both in production with beta customers: Vittz, for clinics, and iFleetHub, for trucking companies. Before that, I helped build a digital bank in Canada and platforms for Brazilian retail.",
  } satisfies L,
  extra: {
    pt: "Prefiro soluções simples de evoluir: DDD, monólito modular e Vertical Slice quando bastam, microsserviços quando são necessários. Uso IA no dia a dia e dentro dos produtos (assistentes com dados reais, transcrição, MCP) e gosto de ensinar quem está começando.",
    en: "I prefer solutions that stay easy to evolve: DDD, modular monoliths and Vertical Slice when they are enough, microservices when they are needed. I use AI every day and inside the products (assistants on real data, transcription, MCP), and I enjoy teaching people who are starting out.",
  } satisfies L,
  email: "pedro@phas.dev",
  links: [
    { label: "GitHub", url: "https://github.com/pedrohqesilva" },
    { label: "LinkedIn", url: "https://linkedin.com/in/pedrohqesilva" },
  ] satisfies Link[],
  // Set to '/cv.pdf' once the file is in /public.
  cv: null as string | null,
};

export const stack: StackGroup[] = [
  { group: { pt: "Linguagens", en: "Languages" }, items: ["C#", "TypeScript", "JavaScript", "SQL"] },
  {
    group: { pt: "Backend", en: "Backend" },
    items: [".NET", "ASP.NET Core", "Entity Framework", "Dapper", "Hangfire", "Node.js"],
  },
  {
    group: { pt: "Frontend e mobile", en: "Frontend and mobile" },
    items: ["React", "Angular", "React Native (Expo)", "Vite", "Tailwind CSS"],
  },
  {
    group: { pt: "Arquitetura", en: "Architecture" },
    items: ["DDD", "Microservices", "Modular Monolith", "Vertical Slice", "Hexagonal", "Event-driven", "SAGA"],
  },
  {
    group: { pt: "Dados", en: "Data" },
    items: ["SQL Server", "PostgreSQL", "Oracle PL/SQL", "MySQL", "MongoDB", "CosmosDB", "DynamoDB", "Redis", "Convex"],
  },
  { group: { pt: "Mensageria", en: "Messaging" }, items: ["Kafka", "RabbitMQ", "Azure Service Bus", "WebSocket"] },
  {
    group: { pt: "Nuvem e infra", en: "Cloud and infra" },
    items: ["Azure", "AWS", "GCP", "Docker", "Kubernetes", "Railway", "Cloudflare"],
  },
  {
    group: { pt: "Observabilidade", en: "Observability" },
    items: ["OpenTelemetry", "Serilog", "Datadog", "PostHog"],
  },
  {
    group: { pt: "Autenticação", en: "Authentication" },
    items: ["OAuth2 / OIDC", "IdentityServer", "Keycloak", "Okta", "WorkOS", "JWT"],
  },
  {
    group: { pt: "Qualidade e CI/CD", en: "Quality and CI/CD" },
    items: ["xUnit (TDD)", "Cucumber (BDD)", "TestCafe", "SonarQube", "GitHub Actions", "Azure DevOps"],
  },
  {
    group: { pt: "IA", en: "AI" },
    items: ["OpenAI", "Claude", "Gemini", "Vercel AI SDK", "MCP", "Claude Code"],
  },
  { group: { pt: "Ferramentas", en: "Tools" }, items: ["Visual Studio", "Swagger", "n8n", "Jira"] },
];

export const experience: Job[] = [
  {
    slug: "paysign",
    company: "Paysign",
    role: { pt: "Engenheiro de Software Sênior", en: "Senior Software Engineer" },
    period: { pt: "dez 2021 - atual", en: "Dec 2021 - present" },
    place: { pt: "remoto, EUA", en: "remote, US" },
    about: {
      pt: "Fintech americana de pagamentos. Atuo em produtos novos e nos padrões técnicos da empresa.",
      en: "US payments fintech. I work on new products and on the company's technical standards.",
    },
    bullets: [
      {
        pt: "Defini a arquitetura base das novas APIs, em Vertical Slice.",
        en: "Defined the base architecture for new APIs, using Vertical Slice.",
      },
      {
        pt: "Criei o SharedKernel, pacote NuGet que padroniza logs, erros, validações e entidades DDD em toda a empresa.",
        en: "Created SharedKernel, a NuGet package that standardises logging, errors, validation and DDD entities across the company.",
      },
      {
        pt: "Levei testes unitários e de integração para o CI/CD, rodando a cada entrega.",
        en: "Brought unit and integration tests into CI/CD, running on every delivery.",
      },
      {
        pt: "Desenvolvo microsserviços e Backend for Frontends na AWS (Lambda, ECS, RDS), do desenho à produção.",
        en: "Build microservices and Backends for Frontends on AWS (Lambda, ECS, RDS), from design to production.",
      },
    ],
    stack: [".NET", "EF Core", "AWS", "Docker", "Serilog", "OpenTelemetry", "TDD", "DDD"],
    details: {
      intro: {
        pt: "Trabalho direto com um cliente do setor financeiro: ajudo a desenhar os projetos novos, defino a arquitetura e crio os pacotes e padrões de código que os times da empresa usam. Também entrego funcionalidades de ponta a ponta, em sistemas novos e legados.",
        en: "I work directly with a client in the financial sector: I help shape new projects, define the architecture and build the packages and code standards the company's teams use. I also ship features end to end, on new and legacy systems.",
      },
      bullets: [
        {
          pt: "O SharedKernel padroniza logs com Serilog e OpenTelemetry, tratamento de erros, validações, objetos de valor, entidades DDD e filas.",
          en: "SharedKernel standardises logging with Serilog and OpenTelemetry, error handling, validation, value objects, DDD entities and queues.",
        },
        {
          pt: "Microsserviços e Backend for Frontends na AWS: Lambda, EC2, ECS, RDS e CloudWatch.",
          en: "Microservices and Backends for Frontends on AWS: Lambda, EC2, ECS, RDS and CloudWatch.",
        },
        {
          pt: "Testes unitários e de integração rodando continuamente no pipeline de CI/CD.",
          en: "Unit and integration tests running continuously in the CI/CD pipeline.",
        },
        { pt: "Scrum com Jira.", en: "Scrum with Jira." },
      ],
      stack: [".NET", "EF Core", "AWS Lambda", "EC2", "ECS", "RDS", "CloudWatch", "Docker", "Serilog", "OpenTelemetry", "NuGet", "TDD", "DDD", "BFF", "Jira"],
    },
  },
  {
    slug: "riachuelo",
    company: "Lojas Riachuelo",
    role: { pt: "Engenheiro de Software Sênior", en: "Senior Software Engineer" },
    period: { pt: "mar 2021 - nov 2021", en: "Mar 2021 - Nov 2021" },
    place: { pt: "Brasil", en: "Brazil" },
    about: {
      pt: "Uma das maiores varejistas de moda do Brasil.",
      en: "One of Brazil's largest fashion retailers.",
    },
    bullets: [
      {
        pt: "Evoluí o DoMeuJeito, plataforma de listas de presentes para casamentos, chás de bebê e outros eventos.",
        en: "Evolved DoMeuJeito, a gift-list platform for weddings, baby showers and other events.",
      },
      {
        pt: "Trabalhei em microsserviços integrados por REST e filas, com Azure Functions escaladas sob demanda por agendamentos e eventos.",
        en: "Worked on microservices connected by REST and queues, with Azure Functions scaled on demand by schedules and events.",
      },
    ],
    stack: [".NET", "Azure Functions", "KEDA", "Kafka", "Azure DevOps", "Docker"],
    details: {
      intro: {
        pt: "O DoMeuJeito é a plataforma colaborativa de listas da Riachuelo, para casamentos, chás de bebê e outras celebrações. Trabalhei na sua evolução, numa arquitetura de microsserviços.",
        en: "DoMeuJeito is Riachuelo's collaborative list platform, for weddings, baby showers and other celebrations. I worked on evolving it, on a microservices architecture.",
      },
      bullets: [
        {
          pt: "Microsserviços que conversam por REST APIs e filas de mensagens.",
          en: "Microservices talking through REST APIs and message queues.",
        },
        {
          pt: "Azure Functions com KEDA para tarefas esporádicas, disparadas por agendamentos (CRON) e por eventos do Kafka.",
          en: "Azure Functions with KEDA for occasional jobs, triggered by schedules (CRON) and Kafka events.",
        },
        {
          pt: "Backend for Frontends, TDD e DDD; Scrum e CI/CD no Azure DevOps.",
          en: "Backends for Frontends, TDD and DDD; Scrum and CI/CD on Azure DevOps.",
        },
      ],
      stack: [".NET", "EF Core", "Azure Functions", "KEDA", "Kafka", "Azure Storage", "Azure Queues", "Azure DevOps", "Docker", "TDD", "DDD", "BFF"],
    },
  },
  {
    slug: "questrade",
    company: "Questrade Financial Group",
    role: { pt: "Engenheiro de Software", en: "Software Engineer" },
    period: { pt: "jun 2020 - mar 2021", en: "Jun 2020 - Mar 2021" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    about: {
      pt: "Grupo financeiro canadense, que estava criando o seu banco digital.",
      en: "Canadian financial group, which was building its digital bank.",
    },
    bullets: [
      {
        pt: "Desenvolvi módulos do banco digital em .NET Core, com TDD, num time distribuído entre países.",
        en: "Built modules of the digital bank in .NET Core, test-first, in a team spread across countries.",
      },
      {
        pt: "Participei das decisões de arquitetura: microsserviços e micro front-ends.",
        en: "Took part in the architecture decisions: microservices and micro front-ends.",
      },
    ],
    stack: [".NET", "EF Core", "GCP", "Kubernetes", "TDD", "DDD", "Scrum"],
    details: {
      intro: {
        pt: "Um banco digital novo no Canadá, construído por uma equipe internacional e multidisciplinar. Participei das reuniões de definição de arquitetura e da execução do dia a dia.",
        en: "A brand-new digital bank in Canada, built by an international, cross-functional team. I took part in the architecture meetings and in day-to-day delivery.",
      },
      bullets: [
        {
          pt: "Módulos estratégicos em .NET Core e EF Core, cobertos por testes (TDD).",
          en: "Core modules in .NET Core and EF Core, covered by tests (TDD).",
        },
        {
          pt: "Microsserviços e micro front-ends rodando em Kubernetes no Google Cloud.",
          en: "Microservices and micro front-ends running on Kubernetes on Google Cloud.",
        },
        { pt: "Scrum, com o time distribuído entre países.", en: "Scrum, with the team spread across countries." },
      ],
      stack: [".NET", "EF Core", "GCP", "Kubernetes", "Docker", "TDD", "DDD", "Micro front-ends", "Scrum"],
    },
  },
  {
    slug: "tce",
    company: "Tribunal de Contas de Minas Gerais",
    role: { pt: "Desenvolvedor Júnior → Analista Desenvolvedor Sênior", en: "Junior Developer → Senior Software Developer" },
    period: { pt: "ago 2017 - mai 2020", en: "Aug 2017 - May 2020" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    about: {
      pt: "O tribunal que fiscaliza as contas públicas do estado. De júnior a sênior em dois anos.",
      en: "The court that audits the state's public accounts. From junior to senior in two years.",
    },
    bullets: [
      {
        pt: "Tirei regras de negócio de procedures Oracle e levei para .NET, com testes.",
        en: "Moved business rules out of Oracle procedures into tested .NET code.",
      },
      {
        pt: "Desenvolvi o sistema de envio digital de documentos ao tribunal.",
        en: "Built the system for submitting documents to the court digitally.",
      },
      {
        pt: "Participei da migração do sistema núcleo para arquitetura hexagonal, da proposta à entrega.",
        en: "Took part in moving the core system to a hexagonal architecture, from proposal to delivery.",
      },
    ],
    stack: [".NET", "Angular", "Oracle PL/SQL", "TDD", "BDD (Cucumber)", "Azure DevOps"],
    details: {
      intro: {
        pt: "Quase três anos no tribunal, passando por quatro cargos. Comecei tirando regras de negócio do banco de dados e terminei desenvolvendo numa arquitetura hexagonal moderna, sempre próximo dos usuários.",
        en: "Almost three years at the court, through four roles. I started by moving business rules out of the database and ended up building on a modern hexagonal architecture, always close to the users.",
      },
      steps: [
        {
          title: { pt: "Desenvolvedor Júnior", en: "Junior Developer" },
          period: { pt: "ago 2017 - jul 2018", en: "Aug 2017 - Jul 2018" },
          text: {
            pt: "Na migração do sistema núcleo, tirei regras de negócio guardadas em procedures do banco e levei para código .NET limpo e organizado.",
            en: "On the core system migration, I moved business rules stored in database procedures into clean, well-organised .NET code.",
          },
        },
        {
          title: { pt: "Desenvolvedor Pleno", en: "Mid-level Developer" },
          period: { pt: "ago 2018 - mai 2019", en: "Aug 2018 - May 2019" },
          text: {
            pt: "Desenvolvi o sistema de acesso externo para envio digital de documentos e reforcei o time de manutenção, onde aprendi a fundo as regras de negócio.",
            en: "Built the external access system for submitting documents digitally and joined the maintenance team, where I learned the business rules in depth.",
          },
        },
        {
          title: { pt: "Analista de Sistemas", en: "Systems Analyst" },
          period: { pt: "jun 2019 - ago 2019", en: "Jun 2019 - Aug 2019" },
          text: {
            pt: "Participei da migração completa do sistema núcleo para os padrões de mercado, da proposta ao desenvolvimento.",
            en: "Took part in the full migration of the core system to current industry standards, from proposal to development.",
          },
        },
        {
          title: { pt: "Analista Desenvolvedor Sênior", en: "Senior Software Developer" },
          period: { pt: "set 2019 - mai 2020", en: "Sep 2019 - May 2020" },
          text: {
            pt: "Desenvolvi funcionalidades numa arquitetura hexagonal, do entendimento da tarefa à entrega, em contato constante com os usuários.",
            en: "Built features on a hexagonal architecture, from understanding the task to delivery, in constant contact with the users.",
          },
        },
      ],
      stack: [".NET Framework", ".NET Core", "EF 6", "EF Core", "Angular", "jQuery", "Oracle PL/SQL", "TDD", "BDD (Cucumber)", "Hexagonal", "Azure DevOps", "Scrum"],
    },
  },
  {
    slug: "estagios",
    company: "ASPPrev e Athos Negócios",
    role: { pt: "Estagiário", en: "Intern" },
    period: { pt: "jan 2017 - ago 2017", en: "Jan 2017 - Aug 2017" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    bullets: [
      {
        pt: "ASPPrev: manutenção e modelagem do banco do sistema de contabilidade.",
        en: "ASPPrev: maintained and modelled the accounting system's database.",
      },
      {
        pt: "Athos Negócios: funcionalidades num ERP para associações de seguro e rastreamento veicular.",
        en: "Athos Negócios: built features for an ERP serving insurance associations and vehicle tracking.",
      },
    ],
    stack: ["PostgreSQL", ".NET WebForms", "SQL Server"],
    details: {
      intro: {
        pt: "Dois estágios no mesmo ano, um em banco de dados e outro em desenvolvimento web.",
        en: "Two internships in the same year, one in databases and one in web development.",
      },
      steps: [
        {
          title: { pt: "ASPPrev, estágio em banco de dados", en: "ASPPrev, database intern" },
          period: { pt: "jul 2017 - ago 2017", en: "Jul 2017 - Aug 2017" },
          text: {
            pt: "Manutenção, análise e modelagem do banco do sistema de contabilidade, e apoio aos colegas com queries SQL.",
            en: "Maintained, analysed and modelled the accounting system's database, and helped colleagues with SQL queries.",
          },
        },
        {
          title: { pt: "Athos Negócios, estágio em desenvolvimento web", en: "Athos Negócios, web development intern" },
          period: { pt: "jan 2017 - jun 2017", en: "Jan 2017 - Jun 2017" },
          text: {
            pt: "Funcionalidades novas e manutenção num ERP para associações de seguro e rastreamento veicular.",
            en: "New features and maintenance on an ERP for insurance associations and vehicle tracking.",
          },
        },
      ],
      stack: ["PostgreSQL", ".NET WebForms", "SQL Server", "jQuery"],
    },
  },
];

export const projects: Project[] = [
  {
    name: "Vittz",
    logo: "/projects/vittz.svg",
    url: "https://vittz.com.br",
    period: { pt: "fev 2026 - atual", en: "Feb 2026 - present" },
    status: { pt: "Em produção com clínicas beta.", en: "In production with beta clinics." },
    role: { pt: "CEO & Founder", en: "CEO & Founder" },
    tagline: { pt: "Cuidar de gente, não de planilha.", en: "Care for people, not spreadsheets." },
    description: {
      pt: "Gestão para clínicas pequenas e profissionais autônomos, começando pela odontologia: agenda, prontuário, financeiro, estoque e WhatsApp num lugar só.",
      en: "Management for small clinics and solo practitioners, starting with dentistry: scheduling, health records, billing, inventory and WhatsApp in one place.",
    },
    highlights: [
      {
        pt: "IA com dados reais: o assistente consulta pacientes, agenda e leads, e transforma o áudio da consulta em evolução clínica no formato SOAP.",
        en: "AI on real data: the assistant looks up patients, schedules and leads, and turns consultation audio into SOAP clinical notes.",
      },
      {
        pt: "Odontograma por voz: o dentista preenche o odontograma falando.",
        en: "Voice dental chart: the dentist fills in the chart by speaking.",
      },
      {
        pt: "Paciente sem login: formulários, orçamentos, assinaturas, agendamento e check-in por links seguros.",
        en: "No patient logins: forms, quotes, signatures, booking and check-in through secure links.",
      },
      {
        pt: "Operação integrada: bot de WhatsApp com fluxos visuais, cobrança e importação de notas fiscais por OCR.",
        en: "Integrated operations: a WhatsApp bot with visual flows, billing and OCR import of supplier invoices.",
      },
      {
        pt: "Feito para a saúde: assinatura digital ICP-Brasil, trilha de auditoria LGPD e permissões por perfil.",
        en: "Built for healthcare: ICP-Brasil digital signatures, LGPD audit trail and role-based permissions.",
      },
      {
        pt: "Por dentro: multi-tenant, tempo real com Convex e front-end organizado em Feature-Sliced Design.",
        en: "Under the hood: multi-tenant, real time with Convex and a front end organised with Feature-Sliced Design.",
      },
    ],
    stack: ["TypeScript", "React", "Vite", "Convex", "Expo", "Vercel AI SDK", "OpenAI", "Claude", "Railway"],
  },
  {
    name: "iFleetHub",
    logo: "/projects/ifleethub.svg",
    url: "https://ifleethub.com.br",
    period: { pt: "abr 2026 - atual", en: "Apr 2026 - present" },
    status: { pt: "Em produção com transportadoras beta.", en: "In production with beta trucking companies." },
    role: { pt: "CEO & Founder", en: "CEO & Founder" },
    tagline: { pt: "Menos planilha. Mais estrada.", en: "Less spreadsheet. More road." },
    description: {
      pt: "A torre de controle da transportadora: cada caminhão no mapa e cada carga acompanhada até a entrega, do escritório à estrada.",
      en: "A control tower for trucking companies: every truck on the map and every load tracked until delivery, from the office to the road.",
    },
    highlights: [
      {
        pt: "Torre de Controle: a frota inteira no mapa, atualizada em tempo real.",
        en: "Control Tower: the whole fleet on a map, updated in real time.",
      },
      {
        pt: "Jornada da Carga: cada entrega acompanhada etapa por etapa, contra o prazo.",
        en: "Load Journey: every delivery tracked step by step, against its deadline.",
      },
      {
        pt: "Modo motorista: login sem senha e desbloqueio por Face ID no app.",
        en: "Driver mode: passwordless login and Face ID unlock in the app.",
      },
      {
        pt: "WhatsApp integrado: transcrição de áudios, resumo de conversas e revisão de texto por IA.",
        en: "Built-in WhatsApp: AI audio transcription, chat summaries and writing review.",
      },
      {
        pt: "Equipe da transportadora: convites por e-mail e perfis de acesso personalizáveis.",
        en: "Company team: email invites and custom access profiles.",
      },
      {
        pt: "Por dentro: monorepo com web, app e site num código só, multi-tenant e tempo real com Convex.",
        en: "Under the hood: one monorepo for web, app and site, multi-tenant and real time with Convex.",
      },
    ],
    stack: ["TypeScript", "React", "Vite", "Convex", "Expo", "MapLibre", "WorkOS", "OpenAI Whisper", "Turborepo", "Railway"],
  },
];

export const education: Course[] = [
  {
    school: "Universidade FUMEC",
    degree: {
      pt: "Mestrado em Sistemas de Informação e Gestão do Conhecimento",
      en: "MSc in Information Systems and Knowledge Management",
    },
    period: "2021 - 2022",
  },
  {
    school: "Universidade FUMEC",
    degree: { pt: "Bacharelado em Ciência da Computação", en: "BSc in Computer Science" },
    period: "2017 - 2020",
  },
  {
    school: "Colégio COTEMIG",
    degree: { pt: "Ensino Médio e Técnico em Tecnologia da Informação", en: "High school and IT technical degree" },
    period: "2014 - 2016",
  },
];

export const languages: L[] = [
  { pt: "Português (nativo)", en: "Portuguese (native)" },
  { pt: "Inglês (profissional)", en: "English (full professional)" },
];

/** Not shown on the site or the resume (kept in case they come back). */
export const certifications = [
  "Software Architecture: Domain-Driven Design",
  "Software Architecture Foundations",
  "Fundamentos do Scrum",
  "Oral and Written Communication in English (Advanced)",
];
