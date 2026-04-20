import getCurrentUser from "../actions/getCurrentUser";
import getListings from "../actions/getListings";
import ClientOnly from "../components/ClientOnly";
import PriceSwitch from "../components/inputs/PriceSwitch";
import ListingsMapView from "../components/ListingsMapView";

export default async function Home({ searchParams }: any) {
  const listings = await getListings(searchParams);
  const currentUser = await getCurrentUser();
  return (
    <ClientOnly>
      <main className="pb-20 px-5 phone:px-10 large:px-20">
        <PriceSwitch />
        <ListingsMapView listings={listings} currentUser={currentUser} />
      </main>
    </ClientOnly>
  );
}
