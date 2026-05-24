import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const siteUrl = 'https://royal.app.br';
const logo = `${siteUrl}/logo.png`;

const pages = [
  {
    path: '/sistema',
    title: 'Royal PMS | Sistema de gestao hoteleira',
    description:
      'Royal PMS e um sistema de gestao hoteleira para reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.',
    keywords:
      'Royal PMS, sistema de gestao hoteleira, PMS hotel, sistema para hotel, software para hotel, sistema para pousada',
  },
  {
    path: '/sistema/pms-hotelaria',
    title: 'PMS para hotelaria | Royal PMS',
    description:
      'Royal PMS e um sistema de gestao hoteleira em nuvem para reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.',
    keywords: 'PMS hotel, sistema de gestao hoteleira, software para hotel, property management system hotel',
  },
  {
    path: '/sistema/sistema-para-hoteis',
    title: 'Sistema para hoteis | Royal PMS',
    description:
      'Sistema para hoteis com reservas, recepcao, governanca, manutencao, eventos, financeiro e dashboards operacionais para equipes hoteleiras.',
    keywords: 'sistema para hotel, software para hotel, sistema hoteleiro, gestao de hotel',
  },
  {
    path: '/sistema/sistema-para-pousadas',
    title: 'Sistema para pousadas | Royal PMS',
    description:
      'Royal PMS para pousadas: controle reservas, UHs, governanca, manutencao, financeiro e atendimento em uma plataforma simples para a equipe.',
    keywords: 'sistema para pousada, PMS pousada, software para pousada, gestao de pousadas',
  },
  {
    path: '/sistema/governanca-hotelaria',
    title: 'Controle de governanca para hotelaria | Royal PMS',
    description:
      'Organize governanca hoteleira com status de UHs, equipe, bloqueios, limpeza, liberacao e integracao com recepcao e manutencao.',
    keywords: 'controle de governanca hotelaria, governanca hotel, limpeza de quartos hotel, status UH',
  },
  {
    path: '/sistema/manutencao-hotelaria',
    title: 'Sistema de manutencao para hotel | Royal PMS',
    description:
      'Sistema de manutencao hoteleira com chamados QR, Telegram, quadro ao vivo, falta de pecas, preventiva, SLA e vistoria.',
    keywords: 'sistema de manutencao para hotel, chamado manutencao hotel, quadro ao vivo manutencao hotel, preventiva hotel',
  },
  {
    path: '/sistema/eventos-hotelaria',
    title: 'Sistema para eventos em hotel | Royal PMS',
    description:
      'Gerencie eventos de hotel com leads da landing, cotacoes, O.S. de eventos, saloes, orcamentos e acompanhamento comercial.',
    keywords: 'ordem de servico para eventos hotel, sistema eventos hotelaria, cotacao eventos hotel, salao de eventos hotel',
  },
  {
    path: '/sistema/financeiro-hotelaria',
    title: 'Sistema financeiro para hotelaria | Royal PMS',
    description:
      'Controle financeiro hoteleiro com faturas, arquivos fiscais, clientes corporativos, extratos e documentos premium para impressao.',
    keywords: 'sistema financeiro para hotel, faturamento hotelaria, faturas hotel, financeiro hoteleiro',
  },
  {
    path: '/sistema/motor-de-reservas',
    title: 'Motor de reservas direto para hotel | Royal PMS',
    description:
      'Motor de reservas direto conectado ao PMS para captar solicitacoes no site do hotel e reduzir dependencia de canais externos.',
    keywords: 'motor de reservas direto, reserva direta hotel, sistema de reservas hotel, booking engine hotel',
  },
  {
    path: '/sistema/automacao-whatsapp-hotel',
    title: 'Automacao WhatsApp para hotel | Royal PMS',
    description:
      'Royal PMS para hotelaria com foco em automacao de atendimento, leads, reservas, eventos e operacao integrada ao WhatsApp e IA.',
    keywords: 'automacao whatsapp hotel, atendimento hotel whatsapp, IA hotelaria, PMS com IA',
  },
  {
    path: '/sistema/revenue-tarifas-hotel',
    title: 'Revenue e tarifas para hotel | Royal PMS',
    description:
      'Apoie revenue e tarifas hoteleiras com dados de reservas, ocupacao, empresas, financeiro e operacao em uma plataforma integrada.',
    keywords: 'revenue hotel, tarifas hotel, gestao de tarifas hoteleiras, sistema revenue hotelaria',
  },
  ...[
    ['hotelaria-macae', 'Macae'],
    ['hotelaria-rio-das-ostras', 'Rio das Ostras'],
    ['hotelaria-campos', 'Campos dos Goytacazes'],
    ['hotelaria-buzios', 'Buzios'],
    ['hotelaria-cabo-frio', 'Cabo Frio'],
    ['hotelaria-rio-de-janeiro', 'Rio de Janeiro'],
  ].map(([slug, city]) => ({
    path: `/sistema/${slug}`,
    title: `Sistema para hotelaria em ${city} | Royal PMS`,
    description: `Royal PMS para hoteis e pousadas em ${city}: reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.`,
    keywords: `sistema hoteleiro ${city}, PMS hotel ${city}, software para hotel ${city}, sistema para pousada ${city}`,
  })),
];

const setTitle = (html, title) => html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
const setMetaName = (html, name, content) =>
  html.replace(new RegExp(`<meta name="${name}" content="[^"]*"[^>]*>`, 'i'), `<meta name="${name}" content="${escapeHtml(content)}" />`);
const setMetaProperty = (html, property, content) =>
  html.replace(new RegExp(`<meta property="${property}" content="[^"]*"[^>]*>`, 'i'), `<meta property="${property}" content="${escapeHtml(content)}" />`);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function jsonLdFor(page) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Royal PMS',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${siteUrl}/sistema`,
      image: logo,
      description:
        'Sistema de gestao hoteleira para reservas, recepcao, governanca, manutencao, eventos, financeiro, marketing e operacao em tempo real.',
      offers: { '@type': 'Offer', category: 'SaaS' },
      publisher: { '@type': 'Organization', name: 'Royal PMS', url: `${siteUrl}/sistema`, logo },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Royal PMS',
      url: `${siteUrl}/sistema`,
      logo,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      url: `${siteUrl}${page.path}`,
      description: page.description,
    },
  ];
}

function renderPage(template, page) {
  const canonical = `${siteUrl}${page.path}`;
  let html = setTitle(template, page.title);
  html = setMetaName(html, 'description', page.description);
  html = setMetaName(html, 'robots', 'index, follow, max-image-preview:large');
  html = setMetaName(html, 'author', 'Royal PMS');
  html = setMetaName(html, 'application-name', 'Royal PMS');
  html = setMetaName(html, 'keywords', page.keywords);
  html = html.replace(/<link rel="canonical" href="[^"]*"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
  html = setMetaProperty(html, 'og:site_name', 'Royal PMS');
  html = setMetaProperty(html, 'og:title', page.title);
  html = setMetaProperty(html, 'og:description', page.description);
  html = setMetaProperty(html, 'og:url', canonical);
  html = setMetaProperty(html, 'og:image', logo);
  html = setMetaName(html, 'twitter:title', page.title);
  html = setMetaName(html, 'twitter:description', page.description);
  html = setMetaName(html, 'twitter:image', logo);
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${JSON.stringify(jsonLdFor(page))}</script>`
  );
  return html;
}

const template = await readFile(join(dist, 'index.html'), 'utf8');

await Promise.all(
  pages.map(async (page) => {
    const target = join(dist, page.path.replace(/^\//, ''), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, renderPage(template, page));
  })
);

console.log(`Prerendered ${pages.length} public SEO pages.`);
