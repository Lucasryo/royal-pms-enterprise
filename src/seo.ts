export type SeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: unknown[];
};

export type SystemSeoPageContent = {
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  keywords: string;
  focus: string[];
  modules: { title: string; body: string }[];
  faqs: { question: string; answer: string }[];
  local?: string;
};

export const SITE_URL = 'https://royal.app.br';

const systemOgImage = `${SITE_URL}/logo.png`;
const hotelOgImage = `${SITE_URL}/hotel/fachada.jpg`;

const normalizePath = (pathname: string) => {
  const clean = pathname.replace(/\/+$/, '');
  return clean || '/';
};

const absoluteUrl = (path: string) => `${SITE_URL}${path === '/' ? '/' : path}`;

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Royal PMS',
  url: `${SITE_URL}/sistema`,
  logo: `${SITE_URL}/logo.png`,
  sameAs: [SITE_URL],
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Royal PMS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE_URL}/sistema`,
  image: systemOgImage,
  description:
    'Sistema de gestao hoteleira para reservas, recepcao, governanca, manutencao, eventos, financeiro, marketing e operacao em tempo real.',
  offers: {
    '@type': 'Offer',
    category: 'SaaS',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Royal PMS',
    url: `${SITE_URL}/sistema`,
    logo: `${SITE_URL}/logo.png`,
  },
};

const faqJsonLd = (page: SystemSeoPageContent) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: page.faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
});

const systemPage = (
  path: string,
  data: Omit<SystemSeoPageContent, 'path'>
): SystemSeoPageContent => ({ path, ...data });

export const SYSTEM_SEO_PAGES: Record<string, SystemSeoPageContent> = {
  '/sistema/pms-hotelaria': systemPage('/sistema/pms-hotelaria', {
    title: 'PMS para hotelaria | Royal PMS',
    description:
      'Royal PMS e um sistema de gestao hoteleira em nuvem para reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.',
    h1: 'PMS para hotelaria com operacao em tempo real',
    eyebrow: 'Sistema operacional do hotel',
    intro:
      'O Royal PMS organiza a rotina do hotel em uma unica plataforma: da reserva ao faturamento, passando por governanca, manutencao, eventos e auditoria.',
    keywords:
      'PMS hotel, sistema de gestao hoteleira, software para hotel, property management system hotel',
    focus: ['Reservas e recepcao', 'Governanca e manutencao', 'Eventos e financeiro', 'Auditoria e permissoes'],
    modules: [
      { title: 'Operacao centralizada', body: 'Recepcao, reservas, UH, clientes, empresas e documentos em uma rotina unica para a equipe.' },
      { title: 'Tempo real para equipes', body: 'Chamados, quadros e status operacionais atualizados sem depender de planilhas paralelas.' },
      { title: 'Gestao por modulo', body: 'Cada setor enxerga o que precisa, com permissoes e fluxos adequados a rotina do hotel.' },
    ],
    faqs: [
      { question: 'O Royal PMS substitui planilhas de controle do hotel?', answer: 'Sim. A proposta e centralizar reservas, operacao, manutencao, eventos e financeiro em fluxos auditaveis.' },
      { question: 'O sistema funciona em nuvem?', answer: 'Sim. O Royal PMS e web e pode ser acessado por equipes autorizadas conforme permissao.' },
      { question: 'Ele atende hoteis independentes?', answer: 'Sim. O foco principal e hotel independente, pousada, hotel corporativo e operacoes de medio porte.' },
    ],
  }),
  '/sistema/sistema-para-hoteis': systemPage('/sistema/sistema-para-hoteis', {
    title: 'Sistema para hoteis | Royal PMS',
    description:
      'Sistema para hoteis com reservas, recepcao, governanca, manutencao, eventos, financeiro e dashboards operacionais para equipes hoteleiras.',
    h1: 'Sistema para hoteis que conecta a operacao inteira',
    eyebrow: 'Hotel independente e corporativo',
    intro:
      'Uma plataforma para reduzir retrabalho entre reservas, recepcao, governanca, manutencao, eventos e financeiro, mantendo historico e visibilidade.',
    keywords: 'sistema para hotel, software para hotel, sistema hoteleiro, gestao de hotel',
    focus: ['Front desk', 'Financeiro hoteleiro', 'Equipe operacional', 'Relatorios'],
    modules: [
      { title: 'Recepcao mais clara', body: 'Acompanhe hospedes, empresas, UHs, check-in, check-out e pendencias sem fragmentar a rotina.' },
      { title: 'Governanca integrada', body: 'Status das unidades, camareiras e liberacoes ficam no mesmo ambiente operacional.' },
      { title: 'Financeiro conectado', body: 'Faturas, arquivos, extratos e cobrancas acompanham o fluxo comercial e operacional.' },
    ],
    faqs: [
      { question: 'Para que tipo de hotel o Royal PMS foi pensado?', answer: 'Para hoteis independentes, corporativos, de eventos e pequenos grupos que precisam de controle operacional.' },
      { question: 'A equipe precisa instalar programa?', answer: 'Nao. A plataforma roda no navegador, com acesso por usuario autorizado.' },
      { question: 'O sistema inclui manutencao?', answer: 'Sim. Chamados, quadro ao vivo, falta de pecas e preventiva fazem parte da operacao.' },
    ],
  }),
  '/sistema/sistema-para-pousadas': systemPage('/sistema/sistema-para-pousadas', {
    title: 'Sistema para pousadas | Royal PMS',
    description:
      'Royal PMS para pousadas: controle reservas, UHs, governanca, manutencao, financeiro e atendimento em uma plataforma simples para a equipe.',
    h1: 'Sistema para pousadas com rotina simples e controle profissional',
    eyebrow: 'Pousadas e pequenos hoteis',
    intro:
      'Controle o essencial sem perder qualidade: reservas, ocupacao, limpeza, manutencao, financeiro e relacionamento com o hospede.',
    keywords: 'sistema para pousada, PMS pousada, software para pousada, gestao de pousadas',
    focus: ['Reservas diretas', 'UH e limpeza', 'Financeiro', 'Atendimento'],
    modules: [
      { title: 'Menos planilha', body: 'A pousada acompanha o dia a dia com informacao centralizada e facil de consultar.' },
      { title: 'Equipe alinhada', body: 'Recepcao, governanca e manutencao trabalham com o mesmo status operacional.' },
      { title: 'Crescimento organizado', body: 'Quando a operacao cresce, os processos ja estao preparados para ganhar escala.' },
    ],
    faqs: [
      { question: 'Uma pousada pequena consegue usar o Royal PMS?', answer: 'Sim. A navegacao e modular e pode ser usada apenas nos fluxos necessarios.' },
      { question: 'Da para controlar limpeza e manutencao?', answer: 'Sim. A pousada pode acompanhar governanca, chamados e preventiva.' },
      { question: 'Existe motor de reservas?', answer: 'O produto possui fluxo publico de reserva direta para captar solicitacoes e organizar a operacao.' },
    ],
  }),
  '/sistema/governanca-hotelaria': systemPage('/sistema/governanca-hotelaria', {
    title: 'Controle de governanca para hotelaria | Royal PMS',
    description:
      'Organize governanca hoteleira com status de UHs, equipe, bloqueios, limpeza, liberacao e integracao com recepcao e manutencao.',
    h1: 'Governanca hoteleira conectada a recepcao e manutencao',
    eyebrow: 'UHs, limpeza e liberacao',
    intro:
      'A governanca deixa de operar isolada e passa a atualizar recepcao, manutencao e gestores com status claros de cada unidade.',
    keywords: 'controle de governanca hotelaria, governanca hotel, limpeza de quartos hotel, status UH',
    focus: ['Status de UH', 'Camareiras', 'Bloqueios', 'Liberacao'],
    modules: [
      { title: 'Status visivel', body: 'Unidades ocupadas, sujas, limpas, vistoriadas ou bloqueadas ficam claras para a equipe.' },
      { title: 'Apoio a recepcao', body: 'A recepcao ganha previsibilidade para check-in e trocas de UH.' },
      { title: 'Acionamento rapido', body: 'Problemas encontrados pela governanca podem virar chamado de manutencao.' },
    ],
    faqs: [
      { question: 'A governanca conversa com a recepcao?', answer: 'Sim. O objetivo e reduzir ligacoes e mensagens paralelas entre os setores.' },
      { question: 'E possivel bloquear UH?', answer: 'Sim. O fluxo do PMS contempla bloqueios e acompanhamento operacional.' },
      { question: 'O modulo funciona no celular?', answer: 'A interface web e responsiva para apoiar a rotina da equipe.' },
    ],
  }),
  '/sistema/manutencao-hotelaria': systemPage('/sistema/manutencao-hotelaria', {
    title: 'Sistema de manutencao para hotel | Royal PMS',
    description:
      'Sistema de manutencao hoteleira com chamados QR, Telegram, quadro ao vivo, falta de pecas, preventiva, SLA e vistoria.',
    h1: 'Manutencao hoteleira com chamados, pecas e quadro ao vivo',
    eyebrow: 'Corretiva, preventiva e SLA',
    intro:
      'O Royal PMS transforma problemas de UH e areas comuns em chamados rastreaveis, com prioridade, tecnico, falta de pecas, vistoria e painel de TV.',
    keywords: 'sistema de manutencao para hotel, chamado manutencao hotel, quadro ao vivo manutencao hotel, preventiva hotel',
    focus: ['Chamados QR', 'Telegram', 'Quadro ao vivo', 'Falta de pecas'],
    modules: [
      { title: 'Chamado que nao se perde', body: 'Cada solicitacao tem status, responsavel, historico, prioridade e atualizacao para a equipe.' },
      { title: 'Pecas pendentes', body: 'Chamados parados por falta de material ficam em uma fila operacional propria.' },
      { title: 'Preventiva hoteleira', body: 'Rotinas programadas podem virar chamados reais quando vencem, entrando no fluxo normal.' },
    ],
    faqs: [
      { question: 'O quadro ao vivo mostra os chamados em tempo real?', answer: 'Sim. Ele foi desenhado para acompanhamento operacional em TV ou tela dedicada.' },
      { question: 'O tecnico pode informar falta de pecas?', answer: 'Sim. O chamado entra na fila de Equipamentos ate as pecas chegarem.' },
      { question: 'Preventiva vira chamado?', answer: 'Sim. Quando uma preventiva vence, ela pode gerar chamado operacional para execucao e acompanhamento.' },
    ],
  }),
  '/sistema/eventos-hotelaria': systemPage('/sistema/eventos-hotelaria', {
    title: 'Sistema para eventos em hotel | Royal PMS',
    description:
      'Gerencie eventos de hotel com leads da landing, cotacoes, O.S. de eventos, saloes, orcamentos e acompanhamento comercial.',
    h1: 'Eventos de hotel com cotacao, O.S. e acompanhamento comercial',
    eyebrow: 'Saloes, leads e orcamentos',
    intro:
      'Capte pedidos de eventos no site do hotel, organize leads no PMS e gere cotacoes e ordens de servico com identidade profissional.',
    keywords: 'ordem de servico para eventos hotel, sistema eventos hotelaria, cotacao eventos hotel, salao de eventos hotel',
    focus: ['Leads', 'Cotacao', 'O.S. de eventos', 'Remarketing'],
    modules: [
      { title: 'Lead organizado', body: 'Dados do interessado, tipo de evento, datas e necessidades ficam disponiveis para consultores.' },
      { title: 'Documento premium', body: 'Cotacoes e O.S. saem com visual institucional, pronto para envio e impressao.' },
      { title: 'Retomada comercial', body: 'Leads desistentes ou incompletos podem ser acompanhados para recuperacao da venda.' },
    ],
    faqs: [
      { question: 'O Royal PMS capta leads de eventos?', answer: 'Sim. A landing do hotel envia cotacoes para a area de Eventos do PMS.' },
      { question: 'Da para gerar O.S. de evento?', answer: 'Sim. O modulo possui documento de O.S. e cotacao para operacao do evento.' },
      { question: 'Serve para hotel com salao?', answer: 'Sim. O foco e hotel que vende locacao, coffee break, hospedagem e estrutura para eventos.' },
    ],
  }),
  '/sistema/financeiro-hotelaria': systemPage('/sistema/financeiro-hotelaria', {
    title: 'Sistema financeiro para hotelaria | Royal PMS',
    description:
      'Controle financeiro hoteleiro com faturas, arquivos fiscais, clientes corporativos, extratos e documentos premium para impressao.',
    h1: 'Financeiro hoteleiro integrado a operacao e documentos',
    eyebrow: 'Faturas, empresas e cobranca',
    intro:
      'O financeiro acompanha empresas, documentos, faturas, arquivos e comunicacao com a operacao sem depender de controles soltos.',
    keywords: 'sistema financeiro para hotel, faturamento hotelaria, faturas hotel, financeiro hoteleiro',
    focus: ['Faturas', 'Empresas', 'Arquivos', 'Extratos'],
    modules: [
      { title: 'Fatura com identidade', body: 'Documentos de faturamento seguem a identidade Royal e podem ser impressos ou salvos em PDF.' },
      { title: 'Cliente corporativo', body: 'Empresas, arquivos e historico financeiro ficam associados para consulta e cobranca.' },
      { title: 'Fluxo auditavel', body: 'A equipe acompanha status e documentos com mais rastreabilidade.' },
    ],
    faqs: [
      { question: 'O modulo financeiro substitui ERP?', answer: 'Ele centraliza o financeiro operacional hoteleiro; integracoes fiscais podem ser tratadas conforme necessidade.' },
      { question: 'Da para gerar faturas?', answer: 'Sim. O PMS possui faturas e documentos de apoio para o fluxo de cobranca.' },
      { question: 'Atende faturamento corporativo?', answer: 'Sim. Empresas e arquivos ficam vinculados aos processos do hotel.' },
    ],
  }),
  '/sistema/motor-de-reservas': systemPage('/sistema/motor-de-reservas', {
    title: 'Motor de reservas direto para hotel | Royal PMS',
    description:
      'Motor de reservas direto conectado ao PMS para captar solicitacoes no site do hotel e reduzir dependencia de canais externos.',
    h1: 'Motor de reservas direto conectado ao PMS',
    eyebrow: 'Reserva direta no site do hotel',
    intro:
      'Transforme a landing do hotel em uma origem de reservas diretas, com consulta, dados do hospede e continuidade operacional no PMS.',
    keywords: 'motor de reservas direto, reserva direta hotel, sistema de reservas hotel, booking engine hotel',
    focus: ['Site do hotel', 'Reserva direta', 'Captacao', 'Operacao'],
    modules: [
      { title: 'Conversao no site', body: 'O cliente encontra quartos, datas e chamada de reserva sem sair do ambiente oficial do hotel.' },
      { title: 'Dados estruturados', body: 'A solicitacao chega com informacoes uteis para recepcao e reservas.' },
      { title: 'Menos dependencia', body: 'A estrategia favorece venda direta e relacionamento proprio.' },
    ],
    faqs: [
      { question: 'O motor fica no site do hotel?', answer: 'Sim. Ele pode ser apresentado em um bloco publico conectado ao PMS.' },
      { question: 'Substitui OTA?', answer: 'Nao necessariamente. A proposta e fortalecer a reserva direta e reduzir dependencia.' },
      { question: 'Funciona em mobile?', answer: 'Sim. A experiencia publica foi pensada para celular, tablet e desktop.' },
    ],
  }),
  '/sistema/automacao-whatsapp-hotel': systemPage('/sistema/automacao-whatsapp-hotel', {
    title: 'Automacao WhatsApp para hotel | Royal PMS',
    description:
      'Royal PMS para hotelaria com foco em automacao de atendimento, leads, reservas, eventos e operacao integrada ao WhatsApp e IA.',
    h1: 'Automacao para WhatsApp e atendimento hoteleiro',
    eyebrow: 'Conversas que viram operacao',
    intro:
      'O Royal PMS posiciona atendimento, leads e rotina operacional para trabalhar com automacao, WhatsApp e IA sem perder controle interno.',
    keywords: 'automacao whatsapp hotel, atendimento hotel whatsapp, IA hotelaria, PMS com IA',
    focus: ['WhatsApp', 'IA', 'Leads', 'Operacao'],
    modules: [
      { title: 'Leads mais organizados', body: 'Pedidos de reserva e eventos podem chegar estruturados para a equipe comercial.' },
      { title: 'Operacao acionavel', body: 'Conversas deixam de ser apenas mensagens e podem virar tarefas, chamados ou oportunidades.' },
      { title: 'Roadmap de IA', body: 'A plataforma foi pensada para evoluir com triagem, respostas e apoio operacional inteligente.' },
    ],
    faqs: [
      { question: 'O Royal PMS tem IA?', answer: 'O produto ja foi estruturado para fluxos com automacao e IA, com evolucoes por modulo.' },
      { question: 'O WhatsApp substitui o PMS?', answer: 'Nao. O WhatsApp e canal; o PMS e a fonte organizada da operacao.' },
      { question: 'Serve para eventos?', answer: 'Sim. Leads de eventos podem ser tratados como oportunidade comercial.' },
    ],
  }),
  '/sistema/revenue-tarifas-hotel': systemPage('/sistema/revenue-tarifas-hotel', {
    title: 'Revenue e tarifas para hotel | Royal PMS',
    description:
      'Apoie revenue e tarifas hoteleiras com dados de reservas, ocupacao, empresas, financeiro e operacao em uma plataforma integrada.',
    h1: 'Revenue e tarifas com mais contexto operacional',
    eyebrow: 'Receita, ocupacao e decisao',
    intro:
      'A gestao de tarifas melhora quando reservas, empresas, ocupacao, eventos e financeiro estao no mesmo ambiente de decisao.',
    keywords: 'revenue hotel, tarifas hotel, gestao de tarifas hoteleiras, sistema revenue hotelaria',
    focus: ['Tarifas', 'Ocupacao', 'Empresas', 'Indicadores'],
    modules: [
      { title: 'Base operacional', body: 'Dados de reservas e empresas ajudam a entender demanda, sazonalidade e oportunidades.' },
      { title: 'Decisao com contexto', body: 'Eventos, manutencao e ocupacao influenciam disponibilidade e estrategia de venda.' },
      { title: 'Evolucao gradual', body: 'O Royal PMS pode apoiar a organizacao de tarifas e indicadores sem prometer channel manager nativo imediato.' },
    ],
    faqs: [
      { question: 'O modulo e um RMS completo?', answer: 'Nao nesta fase. Ele apoia controle de tarifas e leitura operacional para decisao.' },
      { question: 'Integra com reservas?', answer: 'Sim. A proposta e conectar receita com dados do PMS.' },
      { question: 'Serve para hotel corporativo?', answer: 'Sim. Tarifas por empresa e acompanhamento operacional sao especialmente uteis nesse perfil.' },
    ],
  }),
};

const localPages: Array<{ slug: string; city: string; region: string }> = [
  { slug: 'hotelaria-macae', city: 'Macae', region: 'Norte Fluminense' },
  { slug: 'hotelaria-rio-das-ostras', city: 'Rio das Ostras', region: 'Regiao dos Lagos' },
  { slug: 'hotelaria-campos', city: 'Campos dos Goytacazes', region: 'Norte Fluminense' },
  { slug: 'hotelaria-buzios', city: 'Buzios', region: 'Regiao dos Lagos' },
  { slug: 'hotelaria-cabo-frio', city: 'Cabo Frio', region: 'Regiao dos Lagos' },
  { slug: 'hotelaria-rio-de-janeiro', city: 'Rio de Janeiro', region: 'RJ' },
];

for (const page of localPages) {
  const path = `/sistema/${page.slug}`;
  SYSTEM_SEO_PAGES[path] = systemPage(path, {
    title: `Sistema para hotelaria em ${page.city} | Royal PMS`,
    description: `Royal PMS para hoteis e pousadas em ${page.city}: reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.`,
    h1: `Sistema de gestao hoteleira para ${page.city}`,
    eyebrow: `Hotelaria em ${page.region}`,
    intro:
      'Uma plataforma para hoteis independentes, pousadas e operacoes regionais que precisam profissionalizar reservas, rotina operacional, manutencao e financeiro.',
    keywords: `sistema hoteleiro ${page.city}, PMS hotel ${page.city}, software para hotel ${page.city}, sistema para pousada ${page.city}`,
    local: page.city,
    focus: ['Hoteis independentes', 'Pousadas', 'Operacao regional', 'Venda direta'],
    modules: [
      { title: 'Operacao local mais profissional', body: `Hoteis em ${page.city} podem centralizar equipe, reservas, manutencao e documentos em uma rotina web.` },
      { title: 'Controle para crescer', body: 'A plataforma organiza processos antes que a operacao dependa de planilhas e mensagens soltas.' },
      { title: 'Atendimento e eventos', body: 'Reservas diretas e cotacoes de eventos podem nascer na landing e seguir para o PMS.' },
    ],
    faqs: [
      { question: `O Royal PMS atende hoteis em ${page.city}?`, answer: `Sim. O sistema e web e pode apoiar hoteis, pousadas e operacoes de hotelaria em ${page.city} e regiao.` },
      { question: 'Existe implantacao por modulo?', answer: 'Sim. A operacao pode evoluir por reservas, recepcao, manutencao, governanca, eventos e financeiro.' },
      { question: 'O foco e rede grande ou hotel independente?', answer: 'O foco inicial e hotel independente, pousada, hotel corporativo e operacoes regionais.' },
    ],
  });
}

export const getSystemSeoPage = (pathname: string) => SYSTEM_SEO_PAGES[normalizePath(pathname)] ?? null;

export const getHotelSeoConfig = (): SeoConfig => ({
  title: 'Royal Macae Palace Hotel | Hotel em Macae frente a Praia dos Cavaleiros',
  description:
    'Royal Macae Palace Hotel: hospedagem em Macae frente a Praia dos Cavaleiros, com quartos confortaveis, lazer, gastronomia, eventos e reserva direta.',
  canonicalPath: '/',
  robots: 'index, follow, max-image-preview:large',
  keywords: 'hotel em Macae, Royal Macae Palace Hotel, hotel Cavaleiros Macae, hospedagem Macae, eventos Macae',
  ogImage: hotelOgImage,
  ogType: 'website',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Hotel',
      name: 'Royal Macae Palace Hotel',
      url: SITE_URL,
      image: hotelOgImage,
      telephone: '+55 22 2123-9650',
      email: 'reservas@royalmacae.com.br',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Avenida Atlantica, 1642 - Cavaleiros',
        addressLocality: 'Macae',
        addressRegion: 'RJ',
        addressCountry: 'BR',
      },
    },
  ],
});

export const getSystemSeoConfig = (pathname: string): SeoConfig => {
  const normalized = normalizePath(pathname);
  const page = SYSTEM_SEO_PAGES[normalized];

  if (!page) {
    return {
      title: 'Royal PMS | Sistema de gestao hoteleira',
      description:
        'Royal PMS e um sistema de gestao hoteleira para reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.',
      canonicalPath: '/sistema',
      robots: normalized === '/sistema' ? 'index, follow, max-image-preview:large' : 'noindex, follow',
      keywords:
        'Royal PMS, sistema de gestao hoteleira, PMS hotel, sistema para hotel, software para hotel, sistema para pousada',
      ogImage: systemOgImage,
      ogType: 'website',
      jsonLd: [softwareJsonLd, organizationJsonLd],
    };
  }

  return {
    title: page.title,
    description: page.description,
    canonicalPath: page.path,
    robots: 'index, follow, max-image-preview:large',
    keywords: page.keywords,
    ogImage: systemOgImage,
    ogType: 'website',
    jsonLd: [softwareJsonLd, organizationJsonLd, faqJsonLd(page)],
  };
};

export const getNoIndexSeoConfig = (title = 'Royal PMS | Sistema interno'): SeoConfig => ({
  title,
  description:
    'Area operacional privada do Royal PMS. Conteudo interno protegido para equipes autorizadas.',
  canonicalPath: '/sistema',
  robots: 'noindex, nofollow',
  ogImage: systemOgImage,
  ogType: 'website',
});

export const getCanonicalUrl = (config: SeoConfig) => absoluteUrl(config.canonicalPath);
