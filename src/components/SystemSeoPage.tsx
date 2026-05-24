import { ArrowRight, CheckCircle2, Hotel, MapPin, Sparkles } from 'lucide-react';
import { SystemSeoPageContent } from '../seo';

export default function SystemSeoPage({ page }: { page: SystemSeoPageContent }) {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-900/10 bg-[#f7f4ee]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/sistema" className="flex items-center gap-3">
            <img src="/logo.png" alt="Royal PMS" className="h-10 w-10 rounded-xl object-contain" />
            <div>
              <p className="royal-wordmark text-xl text-amber-600">ROYAL PMS</p>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Sistema hoteleiro</p>
            </div>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-bold text-neutral-600 md:flex">
            <a href="/sistema/pms-hotelaria" className="hover:text-neutral-950">PMS</a>
            <a href="/sistema/manutencao-hotelaria" className="hover:text-neutral-950">Manutencao</a>
            <a href="/sistema/eventos-hotelaria" className="hover:text-neutral-950">Eventos</a>
            <a href="/sistema#login" className="rounded-full bg-neutral-950 px-4 py-2 text-white">Acesso PMS</a>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-100/60 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-amber-800">
            <Sparkles className="h-4 w-4" />
            {page.eyebrow}
          </div>
          <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-normal text-neutral-950 sm:text-5xl lg:text-6xl">
            {page.h1}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-650">
            {page.intro}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="/sistema#login" className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-black text-white shadow-xl shadow-neutral-950/10">
              Solicitar demonstracao
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/sistema" className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-6 py-3 text-sm font-black text-neutral-800">
              Ver plataforma
            </a>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-neutral-900/10 bg-white p-6 shadow-2xl shadow-neutral-900/10">
          <div className="flex items-center gap-3 border-b border-neutral-100 pb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
              {page.local ? <MapPin className="h-6 w-6" /> : <Hotel className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">Foco de busca</p>
              <p className="text-lg font-black text-neutral-950">{page.local ?? 'Hotelaria operacional'}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {page.focus.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-2xl bg-neutral-50 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm font-bold leading-5 text-neutral-700">{item}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Modulos conectados</p>
            <h2 className="mt-3 text-3xl font-black text-neutral-950">O PMS como centro da rotina hoteleira</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {page.modules.map((module) => (
              <article key={module.title} className="rounded-3xl border border-neutral-200 bg-[#fbfaf7] p-6">
                <h3 className="text-lg font-black text-neutral-950">{module.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{module.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">FAQ</p>
            <h2 className="mt-3 text-3xl font-black text-neutral-950">Perguntas frequentes</h2>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              Conteudo publico para orientar hoteis, pousadas e equipes que procuram uma plataforma operacional sem misturar com o site oficial do hotel.
            </p>
          </div>
          <div className="space-y-3">
            {page.faqs.map((faq) => (
              <details key={faq.question} className="group rounded-2xl border border-neutral-200 bg-white p-5">
                <summary className="cursor-pointer text-base font-black text-neutral-950">{faq.question}</summary>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-900/10 bg-neutral-950 px-5 py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="royal-wordmark text-2xl text-amber-400">ROYAL PMS</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
              Sistema de gestao hoteleira para reservas, recepcao, governanca, manutencao, eventos, financeiro e operacao em tempo real.
            </p>
          </div>
          <a href="/" className="text-sm font-bold text-neutral-300 hover:text-white">Site oficial do hotel</a>
        </div>
      </footer>
    </main>
  );
}
