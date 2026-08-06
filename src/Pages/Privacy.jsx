import {
  Bot,
  Database,
  FileKey,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import PublicSiteLayout from "../components/PublicSiteLayout";

const sections = [
  {
    id: "information",
    title: "1. Information we collect",
    content: (
      <>
        <p>We may collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address,
            profile image, and basic account identifiers when you sign in.
          </li>
          <li>
            <strong>User-authorized Google data:</strong> only the Google
            Workspace data covered by permissions you grant, such as Gmail,
            Calendar, Drive, Docs, or Sheets data.
          </li>
          <li>
            <strong>Uploaded and connected data:</strong> files, datasets, and
            records you choose to upload or retrieve from an authorized
            connector.
          </li>
          <li>
            <strong>Usage and audit data:</strong> actions requested, connector
            status, timestamps, error details, and security-relevant events.
          </li>
          <li>
            <strong>Technical data:</strong> browser, device, network, and
            diagnostic information needed to operate and protect the service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "2. How we use information",
    content: (
      <>
        <p>We use information to:</p>
        <ul>
          <li>authenticate users and maintain authorized connections;</li>
          <li>parse, validate, aggregate, and analyze user-selected data;</li>
          <li>
            perform user-directed actions such as reading or sending an email,
            creating a Calendar event or Google Meet link, and reading or
            updating a selected Sheet, Doc, or Drive file;
          </li>
          <li>generate dashboards, reports, exports, and grounded insights;</li>
          <li>protect accounts, investigate errors, and prevent misuse; and</li>
          <li>provide support and improve reliability.</li>
        </ul>
      </>
    ),
  },
  {
    id: "google",
    title: "3. Google API data and Limited Use",
    content: (
      <>
        <p>
          Byizon AI accesses Google user data only after the user grants
          permission through Google OAuth. The data accessed depends on the
          scopes displayed on the Google consent screen and the action the user
          requests.
        </p>
        <p>
          Byizon AI’s use and transfer to any other app of information received
          from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          Google user data is not sold, used for advertising, or used to train
          generalized AI or machine-learning models. Human access is limited to
          cases where the user has given consent, access is required for
          security or support, or access is required by law.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "4. AI-assisted processing",
    content: (
      <>
        <p>
          Byizon AI is designed to process and validate data before sending
          compact, relevant business evidence to an AI model. OAuth tokens,
          passwords, client secrets, and unrelated raw records must not be
          included in AI prompts.
        </p>
        <p>
          AI-generated explanations may be incomplete or incorrect. Users
          should verify important financial, legal, medical, employment, or
          operational decisions against the source data.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "5. When information is shared",
    content: (
      <>
        <p>We may share information only:</p>
        <ul>
          <li>
            with infrastructure or API providers necessary to deliver a
            user-requested feature;
          </li>
          <li>when the user directs Byizon AI to send or share content;</li>
          <li>
            to protect users, enforce these terms, or comply with applicable
            law; or
          </li>
          <li>
            as part of a business transfer, subject to appropriate safeguards
            and notice where required.
          </li>
        </ul>
        <p>We do not sell personal information or Google user data.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "6. Security and retention",
    content: (
      <>
        <p>
          We use reasonable administrative, technical, and organizational
          safeguards, including access controls and separation of secrets from
          application data. No system can guarantee absolute security.
        </p>
        <p>
          Data is retained only for as long as needed to provide the service,
          satisfy user requests, maintain security and audit records, or meet
          legal obligations. Retention may vary by data type and deployment
          configuration.
        </p>
      </>
    ),
  },
  {
    id: "control",
    title: "7. Your choices and controls",
    content: (
      <>
        <ul>
          <li>You can choose which files and connectors to use.</li>
          <li>
            You can revoke Google access from your Google Account security
            settings.
          </li>
          <li>
            You can disconnect a provider from Byizon AI where that option is
            available.
          </li>
          <li>
            You may request access, correction, or deletion by contacting us.
          </li>
        </ul>
        <p>
          Revoking access prevents future API access but may not automatically
          remove data that must be retained for security or legal reasons.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "8. Children, changes, and contact",
    content: (
      <>
        <p>
          The service is not directed to children under 13, and we do not
          knowingly collect their personal information.
        </p>
        <p>
          We may update this policy as the service changes. Material updates
          will be reflected by changing the effective date and, where
          appropriate, providing additional notice.
        </p>
        <p>
          Questions or requests can be sent to{" "}
          <a href="mailto:ronakagarwal9772@gmail.com">
            ronakagarwal9772@gmail.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function Privacy() {
  return (
    <PublicSiteLayout>
      <section className="legal-hero">
        <div className="public-container">
          <span className="public-eyebrow">
            <ShieldCheck size={17} aria-hidden="true" />
            Privacy and data protection
          </span>
          <h1>Privacy Policy</h1>
          <p>
            This policy explains what Byizon AI processes, why it is processed,
            and the choices available when you upload data or connect a business
            service.
          </p>
          <div className="legal-meta">
            <span>Effective: July 28, 2026</span>
            <span>Service: Byizon AI</span>
          </div>
        </div>
      </section>

      <section className="legal-summary">
        <div className="public-container legal-summary-grid">
          <article>
            <UserRoundCheck aria-hidden="true" />
            <h2>User controlled</h2>
            <p>Connections and external actions require user authorization.</p>
          </article>
          <article>
            <Database aria-hidden="true" />
            <h2>Purpose limited</h2>
            <p>Data is used to provide requested analytics and workflows.</p>
          </article>
          <article>
            <Bot aria-hidden="true" />
            <h2>Grounded AI</h2>
            <p>Relevant structured evidence is preferred over raw datasets.</p>
          </article>
          <article>
            <LockKeyhole aria-hidden="true" />
            <h2>No data sale</h2>
            <p>Personal information and Google user data are not sold.</p>
          </article>
        </div>
      </section>

      <section className="legal-content-wrap">
        <div className="public-container legal-layout">
          <aside className="legal-toc" aria-label="Privacy policy sections">
            <div>On this page</div>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </aside>

          <article className="legal-document">
            <div className="legal-intro">
              <FileKey aria-hidden="true" />
              <div>
                <h2>About this policy</h2>
                <p>
                  This Privacy Policy applies to the Byizon AI web application,
                  analytics workspace, connected integrations, and public shared
                  outputs operated under this deployment.
                </p>
              </div>
            </div>
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.title}</h2>
                {section.content}
              </section>
            ))}
            <div className="legal-contact">
              <Mail aria-hidden="true" />
              <div>
                <strong>Privacy contact</strong>
                <a href="mailto:ronakagarwal9772@gmail.com">
                  ronakagarwal9772@gmail.com
                </a>
              </div>
            </div>
          </article>
        </div>
      </section>
    </PublicSiteLayout>
  );
}
