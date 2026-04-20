import Image from "next/image";
import useGetCountries from "../../hooks/useGetCountries";
import Link from "next/link";
import Heart from "@/app/components/inputs/Heart";
import { SafeListing, SafeUser } from "../../types";
import { getCloudinaryBlurURL } from "@/app/libs/utils";

interface ListingCardProps {
  data: SafeListing;
  currentUser: SafeUser | null;
  isSelected?: boolean;
  onSelect?: () => void;
}

const ListingCard: React.FC<ListingCardProps> = ({
  data,
  currentUser,
  isSelected,
  onSelect,
}) => {
  const { getCountry } = useGetCountries();
  const location = getCountry(data.locationValue);

  const blurURL = getCloudinaryBlurURL(data.imageSrc);

  return (
    <div
      className={`flex flex-col gap-2 relative rounded-xl transition-shadow duration-200 cursor-pointer ${
        isSelected ? "ring-2 ring-accent-pink shadow-lg" : ""
      }`}
      onClick={onSelect}
    >
      <Heart listingId={data.id} currentUser={currentUser} />
      <Link href={`/rooms/${data.id}`} onClick={(e) => e.stopPropagation()}>
        <Image
          alt={data.title}
          src={data.imageSrc}
          width={800}
          height={800}
          className="rounded-xl w-full h-full aspect-square object-cover"
          placeholder="blur"
          blurDataURL={blurURL}
        />
      </Link>

      <div className="flex flex-col">
        <h3 className="font-semibold">{`${location?.label}, ${location?.region}`}</h3>
        <span className="text-light-gray">{data.category}</span>
      </div>

      <span>
        <span className="font-semibold">{`₹ ${data.price}`}</span> night
      </span>
    </div>
  );
};

export default ListingCard;
