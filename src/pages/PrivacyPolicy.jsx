import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PulseJournalLogo } from '../components/ui/PulseJournalLogo.jsx'

const EFFECTIVE_DATE = 'April 6, 2025'
const CONTACT_EMAIL  = 'privacy@pulsejournal.app'

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-400">{children}</div>
    </section>
  )
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Back button */}
      <Link
        to="/"
        className="fixed top-6 left-6 flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors z-20 px-3 py-1.5 rounded-full"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Home
      </Link>

      <div className="mx-auto max-w-3xl px-6 pt-24 pb-20">
        {/* Header */}
        <div className="mb-12">
          <PulseJournalLogo size="md" />
          <h1 className="mt-8 text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Effective Date: {EFFECTIVE_DATE}</p>
          <div className="mt-4 h-px bg-gray-800" />
        </div>

        <Section title="1. Introduction">
          <p>
            PulseJournal ("we", "us", or "our") operates the PulseJournal trading journal application
            (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard
            your information when you use our Service.
          </p>
          <p>
            By creating an account or using the Service, you agree to the collection and use of information
            in accordance with this policy. If you do not agree with any part of this policy, please do
            not use the Service.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <p><span className="text-gray-300 font-medium">Account information.</span> When you register,
            we collect your email address, name (optional), and a hashed password — or, if you sign in
            via OAuth, the basic profile information provided by that provider (name, email address,
            and profile picture). We do not store OAuth provider passwords.
          </p>
          <p><span className="text-gray-300 font-medium">Trading data.</span> All trade records,
            journal entries, strategy notes, psychology session logs, goals, and other content you
            enter into PulseJournal are stored securely in your account. This data belongs to you.
          </p>
          <p><span className="text-gray-300 font-medium">Usage data.</span> We may collect
            standard server log information such as your IP address, browser type, and pages visited,
            solely for security monitoring and service improvement. We do not sell this data.
          </p>
          <p><span className="text-gray-300 font-medium">Uploaded files.</span> Screenshots or images
            you attach to trade records are stored securely and associated with your account only.
          </p>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide, operate, and maintain the Service</li>
            <li>Authenticate your identity and maintain session security</li>
            <li>Display your trading data, analytics, and journal content back to you</li>
            <li>Send transactional emails (e.g. email verification, password reset)</li>
            <li>Investigate and prevent security incidents or abuse</li>
            <li>Comply with applicable legal obligations</li>
          </ul>
          <p>
            We do not use your trading data to train machine learning models, sell to third parties,
            or share with anyone outside of PulseJournal without your explicit consent.
          </p>
        </Section>

        <Section title="4. Third-Party Services">
          <p>PulseJournal relies on the following third-party services to operate:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-gray-300 font-medium">Supabase</span> — authentication, database
              storage, and file storage. Your data is stored in Supabase's managed PostgreSQL database
              with row-level security enforced. Supabase's privacy policy is available at{' '}
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-white transition-colors" style={{ color: '#9aea62' }}>
                supabase.com/privacy
              </a>.
            </li>
            <li>
              <span className="text-gray-300 font-medium">Vercel</span> — application hosting and
              content delivery. Vercel's privacy policy is at{' '}
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-white transition-colors" style={{ color: '#9aea62' }}>
                vercel.com/legal/privacy-policy
              </a>.
            </li>
            <li>
              <span className="text-gray-300 font-medium">Google, Discord, GitHub (OAuth)</span> — if
              you choose to sign in using one of these providers, the provider shares only your basic
              profile data (name and email) with us. We do not receive access to your accounts on those
              platforms. Their respective privacy policies govern how they handle your data before
              it reaches us.
            </li>
          </ul>
        </Section>

        <Section title="5. Data Storage and Security">
          <p>
            Your data is stored on Supabase's infrastructure hosted on AWS in the Asia-Pacific region.
            All data in transit is encrypted via TLS/HTTPS. Data at rest is encrypted by the underlying
            database engine.
          </p>
          <p>
            Row-Level Security (RLS) policies are enforced at the database level, meaning your data
            is strictly isolated — no other user can access your trade records, journal entries, or
            any other content in your account.
          </p>
          <p>
            While we take security seriously and implement industry-standard protections, no system
            is 100% immune to breaches. We will notify affected users promptly in the event of a
            data breach that may compromise their personal information.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain your account data for as long as your account is active. If you delete your
            account, we will delete or anonymise your personal information within 30 days, except
            where retention is required by law.
          </p>
          <p>
            Trading records you explicitly delete are removed from the database immediately. Backup
            retention may mean they persist in backups for up to 7 days before permanent deletion.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>Depending on your jurisdiction, you may have the following rights regarding your data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-gray-300 font-medium">Access</span> — request a copy of the data we hold about you</li>
            <li><span className="text-gray-300 font-medium">Correction</span> — request that inaccurate data be corrected</li>
            <li><span className="text-gray-300 font-medium">Deletion</span> — request that your account and associated data be deleted</li>
            <li><span className="text-gray-300 font-medium">Portability</span> — export your trading data at any time from the Import/Export section of the app</li>
            <li><span className="text-gray-300 font-medium">Objection</span> — object to certain uses of your data</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-white transition-colors" style={{ color: '#9aea62' }}>
              {CONTACT_EMAIL}
            </a>.
          </p>
        </Section>

        <Section title="8. Cookies and Local Storage">
          <p>
            PulseJournal uses browser <span className="text-gray-300 font-medium">localStorage</span> to
            store your authentication session token so you remain signed in between visits. We do not
            use third-party tracking cookies or advertising cookies.
          </p>
          <p>
            You can clear localStorage at any time through your browser's developer tools or privacy
            settings. Doing so will sign you out of the Service.
          </p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            The Service is not directed at children under the age of 13. We do not knowingly collect
            personal information from children under 13. If you believe a child has provided us with
            personal information, please contact us and we will delete it promptly.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. When we do, we will revise the
            "Effective Date" at the top of this page. For material changes, we will notify you via
            email or a notice within the application. Continued use of the Service after changes
            are posted constitutes your acceptance of the revised policy.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have any questions about this Privacy Policy or how we handle your data, please
            contact us at:
          </p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-white transition-colors" style={{ color: '#9aea62' }}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        {/* Footer nav */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>© {new Date().getFullYear()} PulseJournal</span>
          <div className="flex gap-6">
            <Link to="/terms" className="hover:text-gray-400 transition-colors">Terms of Service</Link>
            <Link to="/" className="hover:text-gray-400 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
