import {
  BadgeCheck,
  CircleAlert,
  FileCheck2,
  Link2,
  Scale,
} from "lucide-react";
import PublicSiteLayout from "../components/PublicSiteLayout";

const terms = [
  {
    id: "acceptance",
    title: "1. Acceptance and eligibility",
    body: (
      <>
        <p>
          By accessing or using Byizon AI, you agree to these Terms of Service
          and the Privacy Policy. If you use the service for an organization,
          you confirm that you are authorized to accept these terms for that
          organization.
        </p>
        <p>
          You must be legally able to enter into this agreement and must not use
          the service where prohibited by applicable law.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "2. The service",
    body: (
      <>
        <p>
          Byizon AI provides tools for uploading or connecting data, performing
          deterministic data processing, generating analytics, creating
          dashboards and reports, and executing supported user-directed
          workflows.
        </p>
        <p>
          Features may be experimental, unavailable, rate limited, or changed
          as the product develops. A visible feature does not guarantee that a
          third-party integration is configured or authorized.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. Accounts and connected services",
    body: (
      <>
        <p>
          You are responsible for your account activity, for protecting access
          to your devices, and for reviewing permissions before authorizing a
          provider.
        </p>
        <p>
          Google, Slack, and other connected services are governed by their own
          terms and policies. You may revoke access through the provider or
          disconnect the integration in Byizon AI where supported.
        </p>
      </>
    ),
  },
  {
    id: "actions",
    title: "4. User-directed external actions",
    body: (
      <>
        <p>
          The service may send emails, create calendar events or meeting links,
          update files, post messages, or perform other external actions when
          requested and authorized by the user. You are responsible for
          reviewing recipients, content, dates, files, and destinations before
          requesting or approving an action.
        </p>
        <p>
          Byizon AI may require confirmation for sensitive actions and may
          refuse an action that appears unsafe, unauthorized, or unsupported.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "5. Your data and permissions",
    body: (
      <>
        <p>
          You retain ownership of content and data you submit. You grant Byizon
          AI a limited right to host, process, transform, and transmit that data
          only as needed to provide the service, comply with your instructions,
          and maintain security.
        </p>
        <p>
          You must have the rights and permissions required to upload, connect,
          analyze, or share the data you provide.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable use",
    body: (
      <>
        <p>You must not use the service to:</p>
        <ul>
          <li>violate law, privacy rights, or intellectual property rights;</li>
          <li>access accounts or data without authorization;</li>
          <li>distribute malware, spam, fraud, or deceptive content;</li>
          <li>bypass access controls or probe the service for vulnerabilities;</li>
          <li>
            overload, reverse engineer, resell, or misuse the service except as
            permitted by law; or
          </li>
          <li>make unlawful automated decisions about individuals.</li>
        </ul>
      </>
    ),
  },
  {
    id: "analysis",
    title: "7. Analytics and AI limitations",
    body: (
      <>
        <p>
          Calculations depend on the supplied data, mappings, filters, and
          configuration. AI-generated explanations and recommendations may be
          incomplete, delayed, or incorrect and should not be treated as
          professional advice.
        </p>
        <p>
          You must independently verify outputs before making financial, legal,
          medical, employment, safety, or other high-impact decisions. Byizon AI
          does not guarantee 100% accuracy.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "8. Shared dashboards and exports",
    body: (
      <>
        <p>
          You are responsible for the data included in shared links, dashboards,
          reports, and exports. Password protection reduces unauthorized access
          but does not replace careful recipient and permission management.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "9. Availability and suspension",
    body: (
      <>
        <p>
          The service is provided on an as-available basis. We may suspend or
          limit access to maintain security, address misuse, comply with law, or
          manage infrastructure and third-party provider failures.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "10. Disclaimers and limitation of liability",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, the service is provided
          without warranties of uninterrupted operation, fitness for a
          particular purpose, or error-free results.
        </p>
        <p>
          To the maximum extent permitted by law, Byizon AI and its operator
          will not be liable for indirect, incidental, special, consequential,
          or punitive damages, or for loss of data, profits, opportunities, or
          goodwill arising from use of the service.
        </p>
      </>
    ),
  },
  {
    id: "general",
    title: "11. Changes, governing law, and contact",
    body: (
      <>
        <p>
          We may update these terms as the service changes. Continued use after
          an updated effective date means you accept the revised terms.
        </p>
        <p>
          These terms are governed by the laws of India, subject to applicable
          consumer protection rules and mandatory local law.
        </p>
        <p>
          Questions can be sent to{" "}
          <a href="mailto:ronakagarwal9772@gmail.com">
            ronakagarwal9772@gmail.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function Terms() {
  return (
    <PublicSiteLayout>
      <section className="legal-hero terms-hero">
        <div className="public-container">
          <span className="public-eyebrow">
            <Scale size={17} aria-hidden="true" />
            Service agreement
          </span>
          <h1>Terms of Service</h1>
          <p>
            These terms describe the rules for using Byizon AI, connected
            services, analytics outputs, and user-directed automations.
          </p>
          <div className="legal-meta">
            <span>Effective: July 28, 2026</span>
            <span>Jurisdiction: India</span>
          </div>
        </div>
      </section>

      <section className="legal-summary">
        <div className="public-container legal-summary-grid terms-summary-grid">
          <article>
            <BadgeCheck aria-hidden="true" />
            <h2>Authorized use</h2>
            <p>Only connect and process data you are permitted to use.</p>
          </article>
          <article>
            <Link2 aria-hidden="true" />
            <h2>Provider terms apply</h2>
            <p>Connected services remain governed by their own terms.</p>
          </article>
          <article>
            <CircleAlert aria-hidden="true" />
            <h2>Verify important output</h2>
            <p>AI and analytics output must be reviewed before action.</p>
          </article>
        </div>
      </section>

      <section className="legal-content-wrap">
        <div className="public-container legal-layout">
          <aside className="legal-toc" aria-label="Terms of Service sections">
            <div>On this page</div>
            {terms.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </aside>

          <article className="legal-document">
            <div className="legal-intro">
              <FileCheck2 aria-hidden="true" />
              <div>
                <h2>Agreement overview</h2>
                <p>
                  These terms apply to the hosted Byizon AI application and its
                  analytics, integrations, reports, shared outputs, and
                  automation features.
                </p>
              </div>
            </div>
            {terms.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </section>
    </PublicSiteLayout>
  );
}
