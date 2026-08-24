export function PageHeader({
  number,
  label,
  title,
  description,
  wip = true,
}: {
  number: string;
  label: string;
  title: string;
  description: string;
  wip?: boolean;
}) {
  return (
    <div className="mb-10">
      <p
        className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
        style={{ animationDelay: "150ms" }}
      >
        {number}. {label}
      </p>
      <div
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 anim-fade-up"
        style={{ animationDelay: "300ms" }}
      >
        <h1 className="font-graphik text-white text-[28px] md:text-[40px] leading-[1.1]">
          {title}
        </h1>
        {wip && (
          <span className="font-manrope border border-[#AFDDFF]/40 px-[6px] py-[2px] text-[#AFDDFF] text-[13px] leading-[15.6px] whitespace-nowrap">
            [ CONTRACTS_NOT_DEPLOYED ]
          </span>
        )}
      </div>
      <p
        className="font-manrope mt-4 max-w-2xl text-white/50 text-[13px] leading-[18px] anim-fade-up"
        style={{ animationDelay: "450ms" }}
      >
        {description}
      </p>
    </div>
  );
}
