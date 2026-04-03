import { Link } from 'react-router-dom';
import { imagery } from '../assets/imagery';
import { PageHero } from '../components/PageHero';
import { Reveal } from '../components/Reveal';

const sections = [
  {
    title: 'Village intelligence',
    subtitle: 'Deep profile, trust signals, coverage, and village drilldown',
    items: [
      {
        title: 'Village profile deep view',
        description: 'Households, tap coverage, schools, anganwadi status, habitation count, contaminants, trust documents, family action guidance, and village timeline.',
        to: '/village-profile',
        status: 'Live',
      },
      {
        title: 'Know My Village wizard',
        description: 'State, district, block, panchayat, and village discovery flow for normal users.',
        to: '/village-profile',
        status: 'Live',
      },
      {
        title: 'Village comparison',
        description: 'Compare nearby villages on quality, risk, alerts, and sensor performance.',
        to: '/village-profile',
        status: 'Live',
      },
      {
        title: 'Village map view',
        description: 'See available villages on the map and move into live status quickly.',
        to: '/village-status',
        status: 'Live',
      },
    ],
  },
  {
    title: 'Water and monitoring',
    subtitle: 'Public water resources, sensors, seasons, sources, and quality',
    items: [
      {
        title: 'Official water resources explorer',
        description: 'State, district, contaminant, and season filters with government-connected water-resource records.',
        to: '/sensors#water-resources',
        status: 'Live',
      },
      {
        title: 'IoT water supply monitoring',
        description: 'Tank level, pump runtime, chlorine residual, supply hours, and latest delivery context.',
        to: '/sensors#iot-monitoring',
        status: 'Live',
      },
      {
        title: 'Groundwater season comparison',
        description: 'Pre-monsoon and post-monsoon view with recharge trend and confidence note.',
        to: '/village-profile',
        status: 'Live',
      },
      {
        title: 'Nearby safe source finder',
        description: 'Find safer nearby sources and open alternate route suggestions.',
        to: '/village-profile',
        status: 'Live',
      },
    ],
  },
  {
    title: 'Citizen action',
    subtitle: 'Complaints, alerts, health reporting, worker actions, and follow-up',
    items: [
      {
        title: 'Citizen services',
        description: 'Report no water, dirty water, bad smell, broken handpump, or health-linked issue and track the request.',
        to: '/citizen-services',
        status: 'Live',
      },
      {
        title: 'Richer complaint workflow',
        description: 'Worker and admin users can move requests from open to in-progress to resolved.',
        to: '/citizen-services',
        status: 'Live',
      },
      {
        title: 'Health reports',
        description: 'Friendly symptom reporting and cluster awareness in plain language.',
        to: '/health-reports',
        status: 'Live',
      },
      {
        title: 'Village alerts',
        description: 'Public-facing alert listing, severity tags, and village updates.',
        to: '/alerts',
        status: 'Live',
      },
    ],
  },
  {
    title: 'AI, accessibility, and trust',
    subtitle: 'Prediction guidance, voice help, easy-read mode, field mode, and transparency',
    items: [
      {
        title: 'Prediction explanations',
        description: 'Risk breakdown, agent outputs, latest prediction, history, and plain-language explanation.',
        to: '/predictions',
        status: 'Live',
      },
      {
        title: 'AI voice assistant',
        description: 'Browser voice input and voice playback in Indian-language friendly mode.',
        to: '/',
        status: 'Live',
      },
      {
        title: 'Easy read and field mode',
        description: 'Bigger text, stronger controls, and local cache or draft support for low-network situations.',
        to: '/profile',
        status: 'Live',
      },
      {
        title: 'Trust and transparency',
        description: 'Confidence score, timestamps, data-source references, mapped contacts, and ingestion readiness.',
        to: '/village-profile',
        status: 'Live',
      },
    ],
  },
];

export const FeatureCenterPage = () => {
  return (
    <>
      <PageHero
        eyebrow="Feature center"
        title="Every major JALERT feature in one visible place"
        subtitle="Use this page as the public index of village intelligence, water mapping, citizen services, alerts, reports, accessibility tools, and AI support."
        image={imagery.hero}
        compact
      />

      {sections.map((section, sectionIndex) => (
        <Reveal key={section.title} className="section" delay={sectionIndex * 40}>
          <section className="content-card">
            <div className="inline-between">
              <div>
                <div className="eyebrow">{section.title}</div>
                <h2>{section.title}</h2>
                <p className="section-subtitle">{section.subtitle}</p>
              </div>
              <Link className="secondary-button" to={section.items[0]?.to ?? '/'}>
                Open section
              </Link>
            </div>

            <div className="card-grid section-tight">
              {section.items.map((item) => (
                <article key={`${section.title}-${item.title}`} className="feature-card interactive-card feature-center-card">
                  <div className="inline-between">
                    <h3>{item.title}</h3>
                    <span className="status-badge safe">{item.status}</span>
                  </div>
                  <p>{item.description}</p>
                  <div className="assistant-links">
                    <Link className="link-chip" to={item.to}>
                      Open feature
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </Reveal>
      ))}
    </>
  );
};
