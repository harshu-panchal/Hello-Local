import { Navigate, useLocation } from "react-router-dom";
import { adDestination } from "../../utils/shopAds";

export default function LegacyProductsRedirect() {
  const location = useLocation();
  return <Navigate to={adDestination(`/products${location.search}`)} replace />;
}
