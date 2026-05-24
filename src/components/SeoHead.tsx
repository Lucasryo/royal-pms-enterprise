import { useEffect } from 'react';
import { getCanonicalUrl, SeoConfig } from '../seo';

type MetaSelector = { name?: string; property?: string };

const findOrCreateMeta = (selector: MetaSelector) => {
  const attr = selector.name ? `name="${selector.name}"` : `property="${selector.property}"`;
  const query = selector.name ? `meta[name="${selector.name}"]` : `meta[property="${selector.property}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(query);
  if (!element) {
    element = document.createElement('meta');
    if (selector.name) element.setAttribute('name', selector.name);
    if (selector.property) element.setAttribute('property', selector.property);
    document.head.appendChild(element);
  }
  element.dataset.seoManaged = attr;
  return element;
};

const setMeta = (selector: MetaSelector, content?: string) => {
  if (!content) return;
  findOrCreateMeta(selector).setAttribute('content', content);
};

const setCanonical = (href: string) => {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', href);
};

const setJsonLd = (items?: unknown[]) => {
  document.head.querySelectorAll('script[data-seo-jsonld="true"]').forEach((node) => node.remove());
  if (!items?.length) return;

  items.forEach((item, index) => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seoJsonld = 'true';
    script.dataset.seoJsonldIndex = String(index);
    script.text = JSON.stringify(item);
    document.head.appendChild(script);
  });
};

export default function SeoHead({ config }: { config: SeoConfig }) {
  useEffect(() => {
    const canonicalUrl = getCanonicalUrl(config);
    document.title = config.title;

    setMeta({ name: 'description' }, config.description);
    setMeta({ name: 'robots' }, config.robots ?? 'index, follow, max-image-preview:large');
    setMeta({ name: 'keywords' }, config.keywords);
    setMeta({ name: 'author' }, config.canonicalPath === '/' ? 'Royal Macae Palace Hotel' : 'Royal PMS');
    setMeta({ name: 'application-name' }, config.canonicalPath === '/' ? 'Royal Macae Palace Hotel' : 'Royal PMS');
    setCanonical(canonicalUrl);

    setMeta({ property: 'og:type' }, config.ogType ?? 'website');
    setMeta({ property: 'og:locale' }, 'pt_BR');
    setMeta({ property: 'og:site_name' }, config.canonicalPath === '/' ? 'Royal Macae Palace Hotel' : 'Royal PMS');
    setMeta({ property: 'og:title' }, config.title);
    setMeta({ property: 'og:description' }, config.description);
    setMeta({ property: 'og:url' }, canonicalUrl);
    setMeta({ property: 'og:image' }, config.ogImage);

    setMeta({ name: 'twitter:card' }, 'summary_large_image');
    setMeta({ name: 'twitter:title' }, config.title);
    setMeta({ name: 'twitter:description' }, config.description);
    setMeta({ name: 'twitter:image' }, config.ogImage);

    setJsonLd(config.jsonLd);
  }, [config]);

  return null;
}
