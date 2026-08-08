// Route-level Suspense boundary. Without this the router holds the previous
// page (at its old scroll position) while this route's data loads, which is
// what made navigation flash near the footer before snapping to the top.
export { default } from "@/components/ui/RouteLoading";
