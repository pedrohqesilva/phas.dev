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
  /** One line on what the company is and what the role was about, read before the bullets. */
  about?: L;
  bullets: L[];
  stack?: string[];
}

export interface Project {
  name: string;
  /** Brand mark served from /public. */
  logo: string;
  url: string;
  status: L;
  /** What I did on it, in one line. */
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
    pt: "Na Paysign, defino a base das novas APIs e os padrões técnicos da empresa. Por conta própria, criei e mantenho o Vittz, SaaS para clínicas com clientes beta, e lidero o iFleetHub. Antes, ajudei a construir um banco digital no Canadá e plataformas do varejo brasileiro.",
    en: "At Paysign I define the foundation of new APIs and the company's technical standards. On my own, I built and run Vittz, a SaaS for clinics with beta customers, and I lead iFleetHub. Before that, I helped build a digital bank in Canada and platforms for Brazilian retail.",
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
  {
    group: { pt: "Backend", en: "Backend" },
    items: ["C#", ".NET", "Entity Framework", "Dapper"],
  },
  {
    group: { pt: "Arquitetura", en: "Architecture" },
    items: ["DDD", "Microservices", "Modular Monolith", "Vertical Slice", "Hexagonal", "Event-driven"],
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
    role: { pt: "Engenheiro de Software Sênior", en: "Senior Software Engineer" },
    period: { pt: "dez 2021 - atual", en: "Dec 2021 - present" },
    place: { pt: "remoto, EUA", en: "remote, US" },
    about: {
      pt: "Fintech americana de pagamentos. Atuo nos produtos novos e nos padrões técnicos usados por toda a empresa.",
      en: "US payments fintech. I work on new products and on the technical standards used across the company.",
    },
    bullets: [
      {
        pt: "Defini e implementei a arquitetura base das novas APIs, em Vertical Slice.",
        en: "Defined and built the base architecture for new APIs, using Vertical Slice.",
      },
      {
        pt: "Criei o SharedKernel, pacote NuGet interno que padroniza logs (Serilog e OpenTelemetry), erros, validações, objetos de valor e entidades DDD.",
        en: "Created SharedKernel, an internal NuGet package that standardises logging (Serilog and OpenTelemetry), errors, validation, value objects and DDD entities.",
      },
      {
        pt: "Implantei a cultura de testes automatizados: unitários e de integração rodando a cada entrega no pipeline de CI/CD.",
        en: "Established automated testing as a habit: unit and integration tests running on every delivery in the CI/CD pipeline.",
      },
      {
        pt: "Desenvolvo funcionalidades novas e melhorias em sistemas legados, de ponta a ponta.",
        en: "Build new features and improve legacy systems, end to end.",
      },
    ],
    stack: [".NET", "EF Core", "AWS (Lambda, ECS, RDS)", "Docker", "TDD", "DDD"],
  },
  {
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
        pt: "Evoluí o DoMeuJeito, plataforma colaborativa de listas para casamentos, chás de bebê e outras celebrações.",
        en: "Evolved DoMeuJeito, a collaborative list platform for weddings, baby showers and other celebrations.",
      },
      {
        pt: "Trabalhei numa arquitetura de microsserviços integrados por REST e filas, com Azure Functions escaladas pelo KEDA a partir de agendamentos e eventos do Kafka.",
        en: "Worked on a microservices architecture connected by REST and queues, with Azure Functions scaled by KEDA from schedules and Kafka events.",
      },
    ],
    stack: [".NET", "Azure Functions", "KEDA", "Kafka", "Azure DevOps", "Docker"],
  },
  {
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
        pt: "Desenvolvi módulos estratégicos do banco digital, num time internacional e multidisciplinar.",
        en: "Built core modules of the digital bank, in an international, cross-functional team.",
      },
      {
        pt: "Participei das decisões de arquitetura, com microsserviços e micro front-ends, e da entrega no dia a dia com Scrum.",
        en: "Took part in the architecture decisions, with microservices and micro front-ends, and in day-to-day delivery with Scrum.",
      },
    ],
    stack: [".NET", "EF Core", "GCP", "Kubernetes", "TDD", "DDD"],
  },
  {
    company: "Tribunal de Contas de Minas Gerais",
    role: { pt: "Desenvolvedor Júnior → Analista Desenvolvedor Sênior", en: "Junior Developer → Senior Developer Analyst" },
    period: { pt: "ago 2017 - mai 2020", en: "Aug 2017 - May 2020" },
    place: { pt: "Belo Horizonte", en: "Belo Horizonte" },
    about: {
      pt: "O tribunal que fiscaliza as contas públicas do estado. Entrei como júnior e cheguei a sênior em dois anos.",
      en: "The court that audits the state's public accounts. I joined as a junior and reached senior in two years.",
    },
    bullets: [
      {
        pt: "Tirei regras de negócio de procedures Oracle e levei para código .NET organizado e coberto por testes (TDD e BDD com Cucumber).",
        en: "Moved business rules out of Oracle procedures into well-structured .NET code covered by tests (TDD, and BDD with Cucumber).",
      },
      {
        pt: "Desenvolvi o sistema de acesso externo, que permite enviar documentos ao tribunal pelo meio digital.",
        en: "Built the external access system that lets documents be submitted to the court digitally.",
      },
      {
        pt: "Participei da migração do sistema núcleo para uma arquitetura hexagonal, da proposta à entrega.",
        en: "Took part in migrating the core system to a hexagonal architecture, from proposal to delivery.",
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
        pt: "ASPPrev: manutenção, análise e modelagem do banco do sistema de contabilidade (PostgreSQL).",
        en: "ASPPrev: maintained, analysed and modelled the accounting system's database (PostgreSQL).",
      },
      {
        pt: "Athos Negócios: funcionalidades num ERP para associações de seguro e rastreamento veicular (.NET WebForms, SQL Server).",
        en: "Athos Negócios: built features for an ERP serving insurance associations and vehicle tracking (.NET WebForms, SQL Server).",
      },
    ],
  },
];

export const projects: Project[] = [
  {
    name: "Vittz",
    logo: "/projects/vittz.svg",
    url: "https://vittz.com.br",
    status: { pt: "Em produção com clínicas beta", en: "In production with beta clinics" },
    role: { pt: "Produto meu, do conceito ao código.", en: "My own product, from concept to code." },
    tagline: { pt: "Cuidar de gente, não de planilha.", en: "Care for people, not spreadsheets." },
    description: {
      pt: "Sistema de gestão para clínicas pequenas e profissionais autônomos, começando pela odontologia. Agenda, prontuário, financeiro, estoque e WhatsApp num lugar só, em tempo real, na web e no celular.",
      en: "Management system for small clinics and solo practitioners, starting with dentistry. Scheduling, health records, billing, inventory and WhatsApp in one place, in real time, on the web and on mobile.",
    },
    highlights: [
      {
        pt: "IA com dados reais: o assistente consulta pacientes, agenda e leads, e transforma o áudio da consulta em evolução clínica no formato SOAP.",
        en: "AI on real data: the assistant looks up patients, schedules and leads, and turns consultation audio into SOAP clinical notes.",
      },
      {
        pt: "Odontograma preenchido por comando de voz.",
        en: "Dental chart filled in by voice.",
      },
      {
        pt: "Paciente sem login: formulários, orçamentos, assinaturas, agendamento e check-in por links seguros.",
        en: "No patient logins: forms, quotes, signatures, booking and check-in through secure links.",
      },
      {
        pt: "WhatsApp com bot de fluxos visuais, cobrança integrada e importação de notas fiscais por OCR.",
        en: "WhatsApp with a visual flow bot, built-in billing and OCR import of supplier invoices.",
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
    status: { pt: "Pré-lançamento, lista de espera aberta", en: "Pre-launch, waitlist open" },
    role: {
      pt: "Desenvolvedor principal: arquitetura, backend, web e app.",
      en: "Lead developer: architecture, backend, web and app.",
    },
    tagline: { pt: "Menos planilha. Mais estrada.", en: "Less spreadsheet. More road." },
    description: {
      pt: "Torre de controle para transportadoras: cada caminhão no mapa em tempo real e cada carga acompanhada até a entrega. Para a equipe de operação no escritório e para o motorista na estrada.",
      en: "A control tower for trucking companies: every truck on a live map and every load tracked until delivery. For the operations team in the office and the driver on the road.",
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
        pt: "Modo motorista no app, com login sem senha e desbloqueio por Face ID.",
        en: "Driver mode in the app, with passwordless login and Face ID unlock.",
      },
      {
        pt: "WhatsApp da empresa integrado, com transcrição de áudios e resumo de conversas por IA.",
        en: "The company's WhatsApp built in, with AI audio transcription and chat summaries.",
      },
      {
        pt: "Por dentro: multi-tenant, perfis de acesso personalizáveis e as mesmas funções na web, na web mobile e no app.",
        en: "Under the hood: multi-tenant, custom access profiles and the same features on web, mobile web and the app.",
      },
    ],
    stack: ["TypeScript", "React", "Vite", "Convex", "Expo", "MapLibre", "WorkOS", "OpenAI Whisper", "Railway"],
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
