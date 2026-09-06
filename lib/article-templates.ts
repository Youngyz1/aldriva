/**
 * lib/article-templates.ts
 *
 * Pre-structured editorial templates for authoring articles on Aldriva.
 * Each template provides a structured starting outline, suggested categories,
 * tags, and excerpt guidance while leaving the author in complete editorial control.
 */

export type ArticleTemplateId =
  | "organization_update"
  | "fundraising_story"
  | "event_recap"
  | "impact_story"
  | "announcement";

export interface ArticleTemplate {
  id: ArticleTemplateId;
  name: string;
  description: string;
  icon: string;
  defaultTitle: string;
  defaultExcerpt: string;
  defaultCategories: string[];
  defaultTags: string[];
  defaultBodyHtml: string;
}

export const ARTICLE_TEMPLATES: ArticleTemplate[] = [
  {
    id: "organization_update",
    name: "Organization Update",
    description: "Share progress, key milestones, roadmap goals, and community messages from your organization.",
    icon: "Building2",
    defaultTitle: "Monthly Community & Progress Update",
    defaultExcerpt: "An update on our latest milestones, recent accomplishments, and upcoming priorities for our community.",
    defaultCategories: ["Community", "Business"],
    defaultTags: ["update", "milestones", "organization", "progress"],
    defaultBodyHtml: `<h2>Executive Summary</h2>
<p>Over the past month, our team and community have focused on expanding our mission and delivering real value to the people we serve. Here is a look at what we've accomplished together.</p>

<h2>Key Milestones & Achievements</h2>
<p>We are proud to highlight several major milestones that reflect the dedication of our supporters and team:</p>
<ul>
  <li><strong>Milestone 1:</strong> Expanded our community outreach programs to support more individuals.</li>
  <li><strong>Milestone 2:</strong> Launched key operational improvements to increase transparency and delivery speed.</li>
  <li><strong>Milestone 3:</strong> Strengthened our partner network across participating regions.</li>
</ul>

<blockquote>
  <p>"Our commitment to our community remains stronger than ever. Thank you to everyone who believes in our mission and drives this work forward every day."</p>
</blockquote>

<h2>Looking Ahead: Next Month's Priorities</h2>
<p>As we move into the next phase, our focus will center on scaling our initiatives, hosting interactive community sessions, and ensuring ongoing sustainability.</p>

<h2>Get Involved</h2>
<p>Have questions, ideas, or feedback? Reach out to our team or explore our latest initiatives directly through our organization hub.</p>`,
  },
  {
    id: "fundraising_story",
    name: "Fundraising Story",
    description: "Compelling narrative explaining the purpose, beneficiaries, urgency, and goal of a campaign.",
    icon: "HandHeart",
    defaultTitle: "Why We Are Raising Funds: Our Story and Mission",
    defaultExcerpt: "Learn about the mission behind our campaign, who we are helping, and how your contribution creates lasting change.",
    defaultCategories: ["Fundraising", "Community"],
    defaultTags: ["fundraiser", "campaign", "giving", "support"],
    defaultBodyHtml: `<h2>The Heart of the Mission</h2>
<p>Every meaningful change begins with a community choosing to stand together. We launched this fundraising initiative to address an urgent need and bring real, tangible relief to those who need it most.</p>

<h2>Who We Are Helping</h2>
<p>Behind every fundraising target is a human story. Your generosity directly benefits families, students, and community members facing critical barriers that cannot be delayed.</p>

<h2>How Your Donation Makes an Immediate Difference</h2>
<p>Transparency and accountability are our highest values. Here is exactly how every dollar is put to work:</p>
<ul>
  <li><strong>Essential Supplies & Direct Aid:</strong> Providing immediate resources to those in need.</li>
  <li><strong>Operational Support:</strong> Ensuring smooth logistics and safe distribution.</li>
  <li><strong>Long-term Sustainability:</strong> Building resources that continue to support beneficiaries over time.</li>
</ul>

<blockquote>
  <p>"No contribution is too small to make a difference. Together, we are creating a network of support and hope."</p>
</blockquote>

<h2>Join Us in Making a Difference</h2>
<p>Please consider supporting our campaign today, whether by making a donation or sharing our story with your friends and family. Your voice multiplies our impact.</p>`,
  },
  {
    id: "event_recap",
    name: "Event Recap & Highlights",
    description: "Summarize a past gathering, celebration, or charity run with photos, statistics, and thank-yous.",
    icon: "Calendar",
    defaultTitle: "Event Recap: Highlights & Moments from Our Gathering",
    defaultExcerpt: "A look back at the unforgettable moments, wonderful attendees, and community impact from our recent event.",
    defaultCategories: ["Events", "Community"],
    defaultTags: ["events", "recap", "gathering", "celebration"],
    defaultBodyHtml: `<h2>An Unforgettable Gathering</h2>
<p>Thank you to everyone who joined us for our recent event! It was an incredible day filled with inspiring conversations, shared energy, and meaningful connection.</p>

<h2>By the Numbers</h2>
<p>Here is a quick snapshot of the day's turnout and achievements:</p>
<ul>
  <li><strong>Attendees:</strong> Hundreds of passionate participants and guests.</li>
  <li><strong>Volunteers & Staff:</strong> Dedicated team members who ensured a seamless experience.</li>
  <li><strong>Impact:</strong> Critical awareness and support generated for our cause.</li>
</ul>

<h2>Key Moments & Highlights</h2>
<p>From the opening remarks to the closing celebration, several highlights stood out:</p>
<ul>
  <li>Inspiring keynote address on the future of community collaboration.</li>
  <li>Engaging workshops and networking sessions among local organizers and supporters.</li>
  <li>Live music, refreshments, and interactive demonstrations that brought everyone together.</li>
</ul>

<blockquote>
  <p>"The energy and solidarity shown by our attendees proves what happens when people unite around a shared vision."</p>
</blockquote>

<h2>Thank You to Our Community & Sponsors</h2>
<p>We extend our deepest gratitude to our sponsors, volunteers, speakers, and every attendee who made this day possible. Stay tuned for announcements about our upcoming gatherings!</p>`,
  },
  {
    id: "impact_story",
    name: "Community Impact Story",
    description: "Deep dive into real people, community transformations, and success stories enabled by Aldriva.",
    icon: "Sparkles",
    defaultTitle: "Stories of Impact: Transforming Lives Through Community Action",
    defaultExcerpt: "Discover how community support and grassroots fundraising are creating measurable change for real people.",
    defaultCategories: ["Community", "Education"],
    defaultTags: ["impact", "story", "transformation", "community"],
    defaultBodyHtml: `<h2>The Challenge We Faced</h2>
<p>When our community encountered significant challenges, local organizers and compassionate supporters refused to stand by. This is the story of how dedicated action transformed adversity into opportunity.</p>

<h2>The Journey to Change</h2>
<p>With focused effort and collaborative support, our team implemented practical solutions designed to deliver sustainable, long-term improvement rather than temporary relief.</p>

<h2>Voices from the Community</h2>
<p>Hearing directly from beneficiaries underscores why this work matters:</p>
<blockquote>
  <p>"Having this support completely changed our family's trajectory. We went from uncertainty to feeling empowered and hopeful about what lies ahead."</p>
</blockquote>

<h2>Measurable Results & Sustainable Growth</h2>
<p>Through careful tracking and community partnership, we have observed remarkable outcomes:</p>
<ul>
  <li>Measurable improvement in local educational and wellness resources.</li>
  <li>Greater community resilience and ongoing peer mentorship.</li>
  <li>Empowered individuals who are now giving back and helping others succeed.</li>
</ul>

<h2>Be Part of the Next Story</h2>
<p>Our journey does not stop here. Learn more about how you can contribute, mentor, or start your own initiative on Aldriva today.</p>`,
  },
  {
    id: "announcement",
    name: "General Announcement",
    description: "Official press release, new feature rollout, leadership update, or community notice.",
    icon: "Megaphone",
    defaultTitle: "Official Announcement: Exciting News & Next Steps",
    defaultExcerpt: "We are pleased to announce an important update regarding our platform, initiatives, and upcoming roadmap.",
    defaultCategories: ["Technology", "Business"],
    defaultTags: ["announcement", "news", "official", "aldriva"],
    defaultBodyHtml: `<h2>For Immediate Release</h2>
<p>We are thrilled to share an important announcement that marks a significant milestone in our journey. Today, we are taking a major step forward in delivering better tools and experiences for our community.</p>

<h2>What Is New?</h2>
<p>Here are the key details of what this announcement entails:</p>
<ul>
  <li><strong>Feature / Initiative 1:</strong> Enhanced capabilities designed to streamline user workflows.</li>
  <li><strong>Feature / Initiative 2:</strong> Improved security, performance, and accessibility across all devices.</li>
  <li><strong>Feature / Initiative 3:</strong> New ways for creators, organizers, and supporters to connect.</li>
</ul>

<h2>Why This Matters</h2>
<p>This update reflects months of careful design, direct feedback from our community, and our steadfast commitment to building transparent, high-impact technology.</p>

<blockquote>
  <p>"Our mission is to empower individuals and organizations with modern, accessible tools that inspire real-world action."</p>
</blockquote>

<h2>What to Expect Next</h2>
<p>This update is rolling out immediately to all users. Check back regularly for further enhancements and community updates.</p>`,
  },
];

export function getTemplateById(id: string): ArticleTemplate | undefined {
  return ARTICLE_TEMPLATES.find((t) => t.id === id);
}
