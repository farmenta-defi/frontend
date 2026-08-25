export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-10">
      <h1
        className="font-graphik text-white text-[28px] md:text-[40px] leading-[1.1] anim-fade-up"
        style={{ animationDelay: "150ms" }}
      >
        {title}
      </h1>
      <p
        className="font-manrope mt-4 max-w-2xl text-white/50 text-[13px] leading-[18px] anim-fade-up"
        style={{ animationDelay: "300ms" }}
      >
        {description}
      </p>
    </div>
  );
}
