import getCurrentUser from "../actions/getCurrentUser";
import getListings from "../actions/getListings";
import ClientOnly from "../components/ClientOnly";
import ListingCard from "../components/listing/ListingCard";
import PriceSwitch from "../components/inputs/PriceSwitch";
import MapComponent from "../components/MapComponent";

export default async function Home({ searchParams }: any) {
  const listings = await getListings(searchParams);
  const currentUser = await getCurrentUser();

  return (
    <ClientOnly>
      <main className="pb-20 px-5 phone:px-10 large:px-20">
        <PriceSwitch />

        {/* Desktop: listings left + sticky map right. Mobile: listings stacked above map */}
        <div className="flex flex-col medium:flex-row medium:gap-8">
          {/* Listing grid */}
          <div className="w-full medium:flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 small:grid-cols-2 medium:grid-cols-3 large:grid-cols-4 gap-8">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  data={listing}
                  currentUser={currentUser}
                />
              ))}
            </div>
          </div>

          {/* Map sidebar — sticky on desktop, full-width strip on mobile */}
          <div className="w-full mt-8 medium:mt-0 medium:w-[40%] large:w-[45%]">
            <div className="sticky top-24 h-[50vh] medium:h-[calc(100vh-6rem)] rounded-xl overflow-hidden">
              <MapComponent listings={listings} />
            </div>
          </div>
        </div>
      </main>
    </ClientOnly>
  );
}
