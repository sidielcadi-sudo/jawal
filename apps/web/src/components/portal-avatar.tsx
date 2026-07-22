/**
 * Avatar rond de la sidebar des portails : la photo de la personne connectée si
 * elle existe, sinon une silhouette neutre. Remplace le logo de l'établissement.
 */
export function PortalAvatar({ photoUrl }: { photoUrl?: string | null }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/25">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="text-white/70"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      )}
    </div>
  );
}
