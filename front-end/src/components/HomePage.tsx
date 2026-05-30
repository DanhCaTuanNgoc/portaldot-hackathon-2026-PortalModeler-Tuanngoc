import { useEffect, useRef } from "react";
import portalLogo from "../assets/logo_portalmodeler.png";
import { heroPartners, heroVideoUrl } from "../domain/constants";

function useRevealOnScroll() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".reveal-section"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
}

export function PortalModelerBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`} aria-label="PortalModeler">
      <img className="brand-mark__symbol" src={portalLogo} alt="" aria-hidden="true" />
      {!compact && (
        <strong className="brand-mark__word">
          Portal<span>Modeler</span>
        </strong>
      )}
    </div>
  );
}

export function HomePage({ onOpenWorkbench }: { onOpenWorkbench: () => void }) {
  useRevealOnScroll();
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) {
      return;
    }

    let animationFrame = 0;
    let replayTimer = 0;
    const fadeSeconds = 0.5;

    function updateOpacity() {
      if (video.duration && Number.isFinite(video.duration)) {
        const remaining = video.duration - video.currentTime;
        let opacity = 1;

        if (video.currentTime < fadeSeconds) {
          opacity = video.currentTime / fadeSeconds;
        } else if (remaining < fadeSeconds) {
          opacity = Math.max(0, remaining / fadeSeconds);
        }

        video.style.opacity = String(opacity);
      }

      animationFrame = window.requestAnimationFrame(updateOpacity);
    }

    function replayVideo() {
      video.style.opacity = "0";
      video.currentTime = 0;
      replayTimer = window.setTimeout(() => {
        void video.play();
      }, 100);
    }

    video.style.opacity = "0";
    video.addEventListener("ended", replayVideo);
    void video.play();
    animationFrame = window.requestAnimationFrame(updateOpacity);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(replayTimer);
      video.removeEventListener("ended", replayVideo);
    };
  }, []);

  return (
    <main className="home-shell">
      <section className="home-hero">
        <video
          ref={heroVideoRef}
          className="home-hero__video"
          src={heroVideoUrl}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="home-hero__blur" aria-hidden="true" />

        <div className="home-hero__layer">
          <nav className="home-nav">
            <PortalModelerBrand />
            {/* <div className="home-nav__links">
              <span className="home-nav__tag">Dev Tool</span>
              <span className="home-nav__tag">Blockchain</span>
              <span className="home-nav__tag">Rust</span>
              <span className="home-nav__tag">Substrate</span>
              <span className="home-nav__tag">Portaldot</span>
            </div> */}
            <div className="home-nav__actions">
              <button className="home-nav__button hero-secondary" onClick={onOpenWorkbench}>
                Open Workbench
              </button>
            </div>
          </nav>
          <div className="home-nav__divider" />

          <div className="home-hero__center">
            <div className="home-hero__content">
              <h1>
                Model <span>Flows</span>
              </h1>
              <p>
                Build, run, and verify Portaldot smart-contract workflows from one visual workbench.
              </p>
              <button className="hero-secondary home-hero__cta" onClick={onOpenWorkbench}>
                Launch Workbench
              </button>
            </div>
          </div>

          <div className="hero-marquee" aria-label="PortalModeler stack">
            <div className="hero-marquee__inner">
              <div className="hero-marquee__label">
                <span>Built for local</span>
                <span>contract demos</span>
              </div>
              <div className="hero-marquee__track">
                <div className="hero-marquee__row">
                  {[...heroPartners, ...heroPartners].map((name, index) => (
                    <div key={`${name}-${index}`} className="hero-logo">
                      <span className="liquid-glass">{name.slice(0, 1)}</span>
                      <strong>{name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* <section id="workflow" className="home-section reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Visual source of truth</span>
          <h2>One graph for the entire local contract path.</h2>
          <p>
            The board maps each step to real repo scripts while keeping configuration visible: endpoint, signer,
            artifacts, deploy fee, call value, and state reads.
          </p>
        </div>
        <div className="feature-grid">
          {[
            ["Chain Connect", "Validate local RPC and runtime readiness."],
            ["Deploy Membership", "Instantiate the ink! contract using safe defaults."],
            ["Read State", "Inspect is_member and joined_at without digging through terminal output."],
          ].map(([title, body]) => (
            <article key={title} className="feature-card">
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="execution" className="home-section home-section--split reveal-section">
        <div className="section-copy">
          <span className="section-label">Developer-safe execution</span>
          <h2>Run nodes without turning the browser into a shell.</h2>
          <p>
            Phase 2 exposes a whitelist runner through Vite middleware. The UI can run known workflow nodes, refresh
            health, and stream command output into structured logs.
          </p>
        </div>
        <div className="terminal-showcase">
          <div>$ python scripts/query.py --url ws://127.0.0.1:9944</div>
          <div className="terminal-success">Connected chain: Development</div>
          <div>$ python scripts/call.py --action is_member</div>
          <div className="terminal-success">Decoded value: {"{'Ok': True}"}</div>
        </div>
      </section>

      <section id="visualization" className="home-section home-section--stats reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">On-chain context</span>
          <h2>State and events are visible as product data.</h2>
          <p>
            Phase 3 adds account, contract, state, and event timeline cards so a hackathon demo can explain what
            happened on-chain without scrolling raw logs.
          </p>
        </div>
        <div className="metric-grid">
          <article>
            <strong>4</strong>
            <span>completed phases</span>
          </article>
          <article>
            <strong>10</strong>
            <span>MVP node templates</span>
          </article>
          <article>
            <strong>1</strong>
            <span>executable Membership flow</span>
          </article>
        </div>
      </section>

      <section className="home-testimonial reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Testimonial</span>
          <h2>Trusted by builders who need demos to behave like products.</h2>
          <p>
            PortalModeler is designed for the moment where contract logic, execution safety, and product storytelling
            need to land in the same screen.
          </p>
        </div>
        <div className="testimonial-marquee" aria-label="User reviews">
          {[0, 1].map((row) => (
            <div key={row} className="testimonial-row" style={{ marginLeft: row === 1 ? 200 : 0 }}>
              {[...testimonialItems, ...testimonialItems, ...testimonialItems].map(([quote, name, role], index) => (
                <article key={`${row}-${name}-${index}`} className="user-review">
                  <p>{quote}</p>
                  <div className="user-review__person">
                    <span>{name.slice(0, 1)}</span>
                    <div>
                      <strong>{name}</strong>
                      <small>{role}</small>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id="future-plan" className="home-section reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Future plan</span>
          <h2>From hackathon workbench to reusable Web3 modeling layer.</h2>
          <p>
            PortalModeler can grow from an executable demo board into a repeatable product workflow for teams building,
            testing, and explaining contract systems.
          </p>
        </div>
        <div className="plan-grid">
          {futurePlanItems.map(([title, body], index) => (
            <article key={title} className="plan-card">
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="home-section home-section--faq reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">FAQ</span>
          <h2>Answers for reviewers and builders.</h2>
          <p>
            The important product constraints are visible: what runs locally, what is protected, and how the MVP can
            evolve after the demo.
          </p>
        </div>
        <div className="faq-list">
          {faqItems.map(([question, answer], index) => {
            const isOpen = openFaqIndexes.includes(index);
            return (
              <article key={question} className={`faq-item ${isOpen ? "open" : ""}`}>
                <button type="button" className="faq-question" onClick={() => toggleFaq(index)}>
                  <span>{question}</span>
                  <strong>{isOpen ? "-" : "+"}</strong>
                </button>
                <div className="faq-answer">
                  <p>{answer}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-action reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Build visually</span>
          <h2>Open the workbench and run the Membership flow.</h2>
          <p>
            Use the board to connect the local chain, deploy the contract, call membership actions, read state, and
            export the graph.
          </p>
        </div>
        <button className="primary-cta" onClick={onOpenWorkbench}>
          Launch workbench
          <ArrowRight size={18} />
        </button>
      </section>

      <footer className="home-footer">
        <div className="home-footer__main">
          <div className="home-footer__brand">
            <PortalModelerBrand />
            <p>Executable visual modeling for local Web3 contract workflows.</p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.title} className="home-footer__column">
              <span>{column.title}</span>
              {column.links.map(([label, href]) =>
                label === "Workbench" ? (
                  <button key={label} type="button" onClick={onOpenWorkbench}>
                    {label}
                  </button>
                ) : (
                  <a key={label} href={href}>
                    {label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="home-footer__bottom">© 2026 PortalModeler. All rights reserved.</div>
      </footer> */}
    </main>
  );
}
