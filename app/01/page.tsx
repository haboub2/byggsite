import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { Icon } from "@/components/Icons";
import { softwareJsonLd } from "@/lib/seo";
import { software01 } from "@/lib/placeholder";
import { softwareCases, softwareProcess, techStack } from "@/lib/software-content";
import { images } from "@/lib/images";

export const metadata: Metadata = {
  title: "Mjukvara, system & automation",
  description:
    "01 är Byggly:s mjukvarugren — webb, automation och interna system byggda med samma hantverkstänk som på byggsidan.",
  alternates: { canonical: "/01" },
};

const triadIcons = ["code", "sync", "grid"];
const featuredCase = softwareCases[0];

export default function SoftwareHome() {
  const [titleLead, titleTail] = software01.title.split("systemen");

  return (
    <>
      <JsonLd data={softwareJsonLd()} />

      {/* Hero */}
      <section className="sw-hero">
        <div className="sw-hero-bg" aria-hidden="true">
          <img src={images.softwareHeroWorkspace} alt="" />
        </div>
        <div className="container sw-hero-grid">
          <Reveal variant="left">
            <span className="eyebrow">{software01.eyebrow}</span>
            <h1 className="sw-hh">
              {titleLead}
              <span className="g">systemen</span>
              {titleTail}
            </h1>
            <p className="sw-hero-lead">{software01.lead}</p>
            <div className="hero-actions">
              <Link href="/01/brief" className="btn btn-primary">
                Starta ett projekt
                <Icon name="arrow" strokeWidth={2.4} />
              </Link>
              <Link href="/01/case" className="btn-ghost-dark">
                Se case
              </Link>
            </div>
            <div className="sw-hero-chips">
              {software01.stats.map((s) => (
                <div className="sw-chip" key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal variant="right">
            <div className="term-card">
              <div className="term-bar">
                <span className="term-dot" style={{ background: "#ff5f56" }} />
                <span className="term-dot" style={{ background: "#ffbd2e" }} />
                <span className="term-dot" style={{ background: "#27c93f" }} />
                <span className="fname">leads/route.ts</span>
              </div>
              <div className="term-body">
                <div><span className="ln">1</span><span className="kw">export async function</span> <span className="fn">POST</span>(req) {"{"}</div>
                <div><span className="ln">2</span>&nbsp;&nbsp;<span className="kw">const</span> lead = <span className="kw">await</span> <span className="fn">parseLead</span>(req)</div>
                <div><span className="ln">3</span>&nbsp;&nbsp;<span className="kw">await</span> db.leads.<span className="fn">insert</span>(lead)</div>
                <div><span className="ln">4</span>&nbsp;&nbsp;<span className="kw">await</span> notify.<span className="fn">sms</span>(lead.phone)</div>
                <div><span className="ln">5</span>&nbsp;&nbsp;<span className="cm">{"// i produktion, inte bara demo"}</span></div>
                <div><span className="ln">6</span>&nbsp;&nbsp;<span className="kw">return</span> Response.<span className="fn">json</span>({"{"} ok: <span className="str">true</span> {"}"})<span className="caret" /></div>
                <div><span className="ln">7</span>{"}"}</div>
              </div>
              <div className="term-foot">
                <div className="stack">
                  <span>Next.js</span>
                  <span>Supabase</span>
                  <span>TypeScript</span>
                </div>
                <div className="ok">
                  <span className="dot" />
                  Deployed
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What 01 does */}
      <section className="sw-whatwedo">
        <div className="container sw-ww-grid">
          <Reveal variant="left">
            <span className="eyebrow">Vad 01 gör</span>
            <h2>Tre sätt vi hjälper</h2>
            <p>Samma sak varje gång: mindre dubbelarbete, system som håller.</p>
            <div className="sw-triad reveal-group">
              {software01.triad.map((t, i) => (
                <Reveal as="div" key={t.title} className="sw-triad-card">
                  <span className="ic">
                    <Icon name={triadIcons[i]} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3>{t.title}</h3>
                    <p>{t.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="sw-stats">
              {software01.stats.map((s) => (
                <div className="s" key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal variant="right">
            <div className="sw-ww-head-row">
              <div>
                <span className="eyebrow">Vårt senaste arbete</span>
                <h2>Case</h2>
              </div>
              <Link href="/01/case">
                Visa alla
                <Icon name="arrow" strokeWidth={2.4} />
              </Link>
            </div>
            <Reveal href={`/01/case/${featuredCase.slug}`} className="sw-case-card">
              <img src={images.dashboardScreen} alt="" loading="lazy" />
              <div className="b">
                <div className="tag-row">
                  {featuredCase.stack.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <h3>{featuredCase.title}</h3>
                <p>{featuredCase.summary}</p>
                <div className="results">
                  {featuredCase.resultat.map((r) => (
                    <div key={r.desc}>
                      <strong>{r.label}</strong>
                      <span>{r.desc}</span>
                    </div>
                  ))}
                </div>
                <span className="go">
                  Läs caset
                  <Icon name="arrow" strokeWidth={2.4} />
                </span>
              </div>
            </Reveal>
          </Reveal>
        </div>
      </section>

      {/* Process + stack split */}
      <div className="sw-split">
        <div className="sw-split-process">
          <span className="eyebrow">Så jobbar vi</span>
          <h2>Från brief till drift</h2>
          <ol className="sw-steps">
            {softwareProcess.map((p) => (
              <li className="sw-step" key={p.n}>
                <span className="circle">{p.n}</span>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="sw-split-stack">
          <span className="eyebrow">Hur vi bygger</span>
          <h2>Modern stack, inget låst</h2>
          <p>Vi väljer aldrig teknik för teknikens skull — men detta är vad vi litar på när inget annat talar emot det.</p>
          <div className="sw-stack-grid">
            {techStack.map((t) => (
              <div className="sw-stack-chip" key={t}>
                <span className="dot" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="sw-cta-band">
        <div className="sw-cta-inner">
          <div className="l">
            <span className="ic">
              <Icon name="code" strokeWidth={1.8} />
            </span>
            <div>
              <h2>Har du ett system som skaver?</h2>
              <p>Berätta kort om läget så återkommer vi med hur vi skulle angripa det.</p>
            </div>
          </div>
          <Link href="/01/brief" className="btn btn-primary">
            Skicka en brief
          </Link>
        </div>
      </div>
    </>
  );
}
