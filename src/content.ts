// Single source of truth for everything the site says.
// Used by the terminal (runtime) and by the static HTML rendered at build time (SEO / no-JS).

export type Lang = "pt" | "en";
export type L = Record<Lang, string>;

export interface Link {
  label: string;
  url: string;
}

export interface Job {
  company: string;
  role: L;
  period: L;
  place: L;
  bullets: L[];
  stack?: string[];
}

export interface Project {
  name: string;
  /** Brand mark served from /public. */
  logo: string;
  url: string;
  status: L;
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
    pt: "Engenheiro de software com foco em backend C#/.NET e experiência em Angular e React. Já trabalhei na criação de um banco digital no Canadá, em marketplaces do varejo brasileiro e em soluções para o setor financeiro norte-americano. Gosto de arquiteturas limpas e cloud-first (Azure e AWS), com DDD, microsserviços, monólitos modulares e Vertical Slice.",
    en: "Software engineer focused on C#/.NET backends, with Angular and React experience. I have helped build a digital bank in Canada, marketplaces for Brazilian retail and solutions for the US financial sector. I like clean, cloud-first architectures (Azure and AWS) using DDD, microservices, modular monoliths and Vertical Slice.",
  } satisfies L,
  extra: {
    pt: "Testo as versões alpha do .NET em projetos pessoais, crio POCs para validar ideias e gosto de compartilhar conhecimento com quem está começando.",
    en: "I try .NET alpha releases in personal projects, build POCs to validate ideas and enjoy sharing knowledge with less experienced developers.",
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
  {
    group: { pt: "Backend", en: "Backend" },
    items: ["C#", ".NET", "Entity Framework", "Dapper"],
  },
  {
    group: { pt: "Arquitetura", en: "Architecture" },
    items: [
      "DDD",
      "Microsserviços",
      "Monólito modular",
      "Vertical Slice",
      "Hexagonal",
    ],
  },
  {
    group: { pt: "Frontend", en: "Frontend" },
    items: ["Angular", "React", "TypeScript"],
  },
  {
    group: { pt: "Dados", en: "Data" },
    items: [
      "SQL Server",
      "PostgreSQL",
      "Oracle PL/SQL",
      "MongoDB",
      "CosmosDB",
      "DynamoDB",
      "Redis",
    ],
  },
  {
    group: { pt: "Mensageria", en: "Messaging" },
    items: ["Kafka", "RabbitMQ", "Azure Service Bus"],
  },
  {
    group: { pt: "Nuvem", en: "Cloud" },
    items: ["Azure", "AWS", "GCP", "Docker", "Kubernetes"],
  },
  {
    group: { pt: "Testes", en: "Testing" },
    items: ["xUnit (TDD)", "Cucumber (BDD)", "TestCafe"],
  },
  {
    group: { pt: "IA", en: "AI" },
    items: ["OpenAI", "Gemini", "Claude", "MCP"],
  },
];

export const experience: Job[] = [
  {
    company: "Paysign",
    role: {
      pt: "Engenheiro de Software Sênior",
      en: "Senior Software Engineer",
    },
    period: { pt: "dez 2021 - atual", en: "Dec 2021 - present" },
    place: { pt: "remoto, EUA", en: "remote, US" },
    bullets: [
      {
        pt: "Defini a arquitetura base das novas APIs usando Vertical Slice.",
        en: "Defined the base architecture for new APIs using Vertical Slice.",
      },
      {
        pt: "Criei o SharedKernel, pacote NuGet corporativo que padroniza logs, erros, validações e entidades DDD.",
        en: "Built SharedKernel, a company-wide NuGet package that standardises logging, errors, validation and DDD entities.",
      },
      {
        pt: "Levei a cultura de testes unitários e de integração para o pipeline de CI/CD.",
        en: "Brought unit and integration testing into the CI/CD pipeline as a team habit.",
      },
    ],
    stack: [".NET", "EF Core", "AWS", "Docker", "TDD", "DDD"],
  },
  {
    company: "Lojas Riachuelo",
    role: {
      pt: "Engenheiro de Software Sênior",
      en: "Senior Software Engineer",
    },
    period: { pt: "mar 2021 - nov 2021", en: "Mar 2021 - Nov 2021" },
    place: { pt: "Brasil", en: "Brazil" },
    bullets: [
      {
        pt: "Evoluí o DoMeuJeito, plataforma de listas para casamentos, chás de bebê e outros eventos.",
        en: "Evolved DoMeuJeito, a gift-list platform for weddings, baby showers and other events.",
      },
      {
        pt: "Microsserviços com REST e filas, e Azure Functions escaladas com KEDA via CRON e Kafka.",
        en: "Microservices over REST and queues, plus Azure Functions scaled with KEDA via CRON and Kafka.",
      },
    ],
    stack: [".NET", "Azure", "Kafka", "Docker"],
  },
  {
    company: "Questrade Financial Group",
    role: { pt: "Engenheiro de Software", en: "Software Engineer" },
    period: { pt: "jun 2020 - mar 2021", en: "Jun 2020 - Mar 2021" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    bullets: [
      {
        pt: "Desenvolvi módulos de um novo banco digital no Canadá, em equipe internacional.",
        en: "Built modules for a new digital bank in Canada, in an international team.",
      },
      {
        pt: "Participei das definições de arquitetura com microsserviços e micro front-ends.",
        en: "Took part in architecture decisions with microservices and micro front-ends.",
      },
    ],
    stack: [".NET", "GCP", "Kubernetes", "TDD"],
  },
  {
    company: "Tribunal de Contas de Minas Gerais",
    role: {
      pt: "Desenvolvedor, de júnior a analista sênior",
      en: "Developer, from junior to senior analyst",
    },
    period: { pt: "ago 2017 - mai 2020", en: "Aug 2017 - May 2020" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    bullets: [
      {
        pt: "Migrei regras de negócio de procedures Oracle para código .NET limpo e testável.",
        en: "Moved business rules out of Oracle procedures into clean, testable .NET code.",
      },
      {
        pt: "Desenvolvi o sistema de acesso externo para envio digital de documentos ao tribunal.",
        en: "Built the external access system for submitting documents to the court digitally.",
      },
      {
        pt: "Participei da migração completa do sistema núcleo, da proposta à entrega.",
        en: "Worked on the full migration of the core system, from proposal to delivery.",
      },
    ],
    stack: [".NET", "Angular", "Oracle PL/SQL", "Cucumber", "Azure DevOps"],
  },
  {
    company: "ASPPrev e Athos Negócios",
    role: { pt: "Estágios", en: "Internships" },
    period: { pt: "jan 2017 - ago 2017", en: "Jan 2017 - Aug 2017" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    bullets: [
      {
        pt: "Banco de dados (PostgreSQL) e desenvolvimento web em um ERP .NET WebForms.",
        en: "Databases (PostgreSQL) and web development on a .NET WebForms ERP.",
      },
    ],
  },
];

export const projects: Project[] = [
  {
    name: "Vittz",
    logo: "/projects/vittz.svg",
    url: "https://vittz.com.br",
    status: { pt: "produto próprio, em produção com clínicas beta", en: "my own product, in production with beta clinics" },
    tagline: { pt: "Cuidar de gente, não de planilha.", en: "Care for people, not spreadsheets." },
    description: {
      pt: "Sistema de gestão para clínicas e consultórios que junta agenda, prontuário, financeiro, estoque e WhatsApp num lugar só. Feito para clínicas pequenas e profissionais autônomos, começando pela odontologia.",
      en: "Management system for clinics and private practices that brings scheduling, health records, billing, inventory and WhatsApp into one place. Built for small clinics and solo professionals, starting with dentistry.",
    },
    highlights: [
      {
        pt: "Assistente de IA que consulta dados reais (pacientes, agenda, leads) e transcreve consultas em evolução clínica no formato SOAP.",
        en: "AI assistant that queries real data (patients, schedule, leads) and turns consultation audio into SOAP clinical notes.",
      },
      {
        pt: "Odontograma por comando de voz e bot de WhatsApp com editor visual de fluxos.",
        en: "Voice-driven dental chart and a WhatsApp bot with a visual flow editor.",
      },
      {
        pt: "Pacientes sem login: formulários, orçamentos, assinatura, agendamento e check-in por links seguros.",
        en: "No patient logins: forms, quotes, signatures, booking and check-in through secure links.",
      },
      {
        pt: "Assinatura digital ICP-Brasil, trilha de auditoria LGPD e permissões granulares por perfil.",
        en: "ICP-Brasil digital signatures, LGPD audit trail and fine-grained role permissions.",
      },
      {
        pt: "Tudo em tempo real, na web e no app mobile, com cobrança integrada e importação de NF-e por OCR.",
        en: "Everything real-time on web and mobile, with built-in billing and OCR invoice import for inventory.",
      },
    ],
    stack: ["React", "Vite", "Convex", "Expo", "TypeScript", "Vercel AI SDK", "OpenAI", "Claude", "Railway"],
  },
  {
    name: "iFleetHub",
    logo: "/projects/ifleethub.svg",
    url: "https://ifleethub.com.br",
    status: { pt: "pré-lançamento, lista de espera aberta", en: "pre-launch, waitlist open" },
    tagline: { pt: "Menos planilha. Mais estrada.", en: "Less spreadsheet. More road." },
    description: {
      pt: "A torre de controle da transportadora: cada caminhão no mapa em tempo real e cada carga acompanhada etapa por etapa até a entrega. Para a equipe de operação e para os motoristas.",
      en: "A control tower for trucking companies: every truck on a live map and every load tracked step by step until delivery. For the operations team and for drivers.",
    },
    highlights: [
      {
        pt: "Torre de Controle com a frota inteira no mapa, atualizada em tempo real.",
        en: "Control Tower with the whole fleet on a live-updating map.",
      },
      {
        pt: "Jornada da Carga: cada entrega acompanhada contra o prazo, etapa por etapa.",
        en: "Load Journey: every delivery tracked against its deadline, step by step.",
      },
      {
        pt: "App com modo motorista, login sem senha e desbloqueio por Face ID.",
        en: "App with a driver mode, passwordless login and Face ID unlock.",
      },
      {
        pt: "WhatsApp por empresa, com transcrição de áudios e resumo de conversas por IA.",
        en: "WhatsApp per company, with AI audio transcription and chat summaries.",
      },
      {
        pt: "Multi-tenant com perfis de acesso personalizáveis, na web, na web mobile e no app.",
        en: "Multi-tenant with custom access profiles, on web, mobile web and the app.",
      },
    ],
    stack: ["React", "Vite", "Convex", "Expo", "MapLibre", "WorkOS", "OpenAI Whisper", "Railway"],
  },
];

export const education: Course[] = [
  {
    school: "Universidade FUMEC",
    degree: {
      pt: "Mestrado, Sistemas de Informação e Gestão do Conhecimento",
      en: "MSc, Information Systems and Knowledge Management",
    },
    period: "2021 - 2022",
  },
  {
    school: "Universidade FUMEC",
    degree: {
      pt: "Bacharelado, Ciência da Computação",
      en: "BSc, Computer Science",
    },
    period: "2017 - 2020",
  },
  {
    school: "Colégio COTEMIG",
    degree: {
      pt: "Técnico em Tecnologia da Informação",
      en: "IT technical high school",
    },
    period: "2014 - 2016",
  },
];

export const languages: L[] = [
  { pt: "Português, nativo", en: "Portuguese, native" },
  { pt: "Inglês, profissional", en: "English, full professional" },
];

export const certifications = [
  "Software Architecture: Domain-Driven Design",
  "Software Architecture Foundations",
  "Fundamentos do Scrum",
];
