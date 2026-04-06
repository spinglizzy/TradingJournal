import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PulseJournalLogo } from '../components/ui/PulseJournalLogo.jsx'

const EFFECTIVE_DATE = 'April 6, 2025'
const CONTACT_EMAIL  = 'support@pulsejournal.app'

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-400">{children}</div>
    </section>
  )
}

export default function TermsOfService() {
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
          <h1 className="mt-8 text-3xl font-bold text-white">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Effective Date: {EFFECTIVE_DATE}</p>
          <div className="mt-4 h-px bg-gray-800" />
        </div>

        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using PulseJournal (the "Service"), you agree to be bound by these Terms
            of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
          </p>
          <p>
            These Terms apply to all users of the Service, including visitors, registered users, and
            any others who access or use the Service.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            PulseJournal is a personal trading journal application that allows users to log and analyse
            their trading activity, track psychology and mindset data, maintain a playbook, and review
            performance over time.
          </p>
          <p>
            The Service is a journaling and analytics tool only. It is not a brokerage, financial
            advisor, investment advisor, or trading platform. Nothing in the Service constitutes
            financial or investment advice of any kind.
          </p>
        </Section>

        <Section title="3. Not Financial Advice">
          <p className="text-white font-medium border border-gray-700 rounded-lg p-4 bg-gray-900">
            IMPORTANT DISCLAIMER: PulseJournal is a personal productivity and journaling tool.
            All analytics, charts, statistics, R-multiples, win rates, and any other data displayed
            within the Service are based solely on trade data you have entered yourself. None of this
            constitutes financial advice, investment advice, trading recommendations, or any form of
            advice regulated by any financial authority. You are solely responsible for your own
            trading decisions. Past performance displayed in PulseJournal does not guarantee or
            predict future results. Trading financial instruments involves substantial risk of loss
            and is not suitable for every investor.
          </p>
        </Section>

        <Section title="4. Account Registration">
          <p>
            To use most features of the Service, you must create an account. You agree to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain the security of your password and accept responsibility for all activity under your account</li>
            <li>Notify us immediately at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}
                className="underline hover:text-white transition-colors" style={{ color: '#9aea62' }}>
                {CONTACT_EMAIL}
              </a> if you believe your account has been compromised
            </li>
            <li>Not share your account credentials with any other person</li>
          </ul>
          <p>
            You are responsible for all activity that occurs under your account. We reserve the right
            to suspend or terminate accounts at our discretion.
          </p>
        </Section>

        <Section title="5. User Content">
          <p>
            You retain full ownership of all trade data, journal entries, notes, images, and other
            content you submit to PulseJournal ("User Content"). By submitting User Content, you
            grant PulseJournal a limited, non-exclusive, royalty-free licence to store, process,
            and display that content solely for the purpose of providing the Service to you.
          </p>
          <p>
            We do not sell, share, or use your User Content to train AI models or for any purpose
            other than operating the Service on your behalf.
          </p>
          <p>
            You are solely responsible for the accuracy and legality of User Content you submit.
            You must not submit content that violates any applicable law.
          </p>
        </Section>

        <Section title="6. Prohibited Uses">
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Violate any applicable law or regulation</li>
            <li>Infringe the intellectual property rights of any third party</li>
            <li>Attempt to gain unauthorised access to other users' accounts or data</li>
            <li>Reverse-engineer, decompile, or scrape any part of the Service</li>
            <li>Transmit malware, viruses, or any malicious code</li>
            <li>Overload or disrupt the Service infrastructure (e.g. DDoS attacks)</li>
            <li>Impersonate any person or entity</li>
            <li>Use the Service for any commercial purpose without our prior written consent</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            The Service, including its design, code, branding, logos, and all content created by
            PulseJournal (excluding User Content), is owned by PulseJournal and protected by
            intellectual property laws. You may not copy, modify, distribute, sell, or create
            derivative works from our intellectual property without written permission.
          </p>
        </Section>

        <Section title="8. Third-Party Services">
          <p>
            The Service integrates with third-party providers including Supabase (database and
            authentication) and Vercel (hosting). Your use of these integrations is also subject
            to the respective providers' terms of service and privacy policies. PulseJournal is
            not responsible for the practices of third-party services.
          </p>
          <p>
            OAuth sign-in via Google, Discord, or GitHub is subject to the terms of those respective
            platforms.
          </p>
        </Section>

        <Section title="9. Disclaimer of Warranties">
          <p>
            THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF
            ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          </p>
          <p>
            We do not warrant that the Service will be uninterrupted, error-free, or completely
            secure. We do not warrant the accuracy of any data, analytics, or calculations displayed
            within the Service.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, PULSEJOURNAL AND ITS OPERATORS
            SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
            DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, OR BUSINESS
            INTERRUPTION, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE.
          </p>
          <p>
            IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED
            TO THE SERVICE EXCEED THE AMOUNT YOU PAID TO USE THE SERVICE IN THE TWELVE MONTHS
            PRECEDING THE CLAIM, OR $10 USD IF YOU HAVE NOT MADE ANY PAYMENTS.
          </p>
        </Section>

        <Section title="11. Indemnification">
          <p>
            You agree to indemnify and hold harmless PulseJournal and its operators from any claims,
            damages, losses, and expenses (including reasonable legal fees) arising out of your use
            of the Service, your User Content, or your violation of these Terms.
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            You may delete your account at any time from the Settings page, which will permanently
            remove your data in accordance with our Privacy Policy.
          </p>
          <p>
            We reserve the right to suspend or terminate your access to the Service at any time,
            with or without notice, if we believe you have violated these Terms or if continued
            operation of your account poses a security or legal risk.
          </p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>
            We may modify these Terms at any time. When we do, we will update the "Effective Date"
            at the top of this page. For material changes, we will notify you via email or an
            in-app notice. Your continued use of the Service after changes are posted constitutes
            your acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="14. Governing Law">
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the
            jurisdiction in which PulseJournal operates, without regard to its conflict of law
            provisions. Any disputes arising from these Terms or the Service shall be resolved
            through good-faith negotiation before resorting to formal legal proceedings.
          </p>
        </Section>

        <Section title="15. Contact Us">
          <p>
            If you have questions about these Terms, please contact us at:
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
            <Link to="/privacy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
            <Link to="/" className="hover:text-gray-400 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
