import { useEffect, useMemo, useState } from "react";
import { getActiveShopAds, ShopAd } from "../services/api/admin/adminShopAdService";
import { isShopAdLive } from "../utils/shopAds";

export function useActiveShopAds() {
  const [ads, setAds] = useState<ShopAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await getActiveShopAds();
        if (mounted) setAds(response.success && Array.isArray(response.data) ? response.data : []);
      } catch {
        if (mounted) setAds([]);
      } finally {
        if (mounted) { setLoading(false); setNow(Date.now()); }
      }
    };
    void refresh();
    const poll = window.setInterval(refresh, 15000);
    const expiry = window.setInterval(() => setNow(Date.now()), 1000);
    const focus = () => { setNow(Date.now()); void refresh(); };
    window.addEventListener("focus", focus);
    return () => { mounted = false; clearInterval(poll); clearInterval(expiry); window.removeEventListener("focus", focus); };
  }, []);
  return { ads: useMemo(() => ads.filter(ad => isShopAdLive(ad, now)), [ads, now]), loading };
}
