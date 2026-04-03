export const PageHero = ({
  eyebrow,
  title,
  subtitle,
  image,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  compact?: boolean;
}) => (
  <section className={`page-hero content-card ${compact ? 'page-hero-compact' : ''}`}>
    <div className="page-hero-inner">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="section-subtitle">{subtitle}</p>
      </div>
      <div className="page-hero-media">
        <img src={image} alt={title} />
      </div>
    </div>
  </section>
);
