import { useEffect, useState } from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/lib/data";
import type { AddressDetail, ComparisonArtifact } from "@/types/data";

type LoadedDetail = { addressKey: string; data: AddressDetail | null };
type LoadedComparison = { addressKey: string; data: ComparisonArtifact | null };

export function useSelectedBlockArtifacts(selectedAddressKey: string | null) {
  const [detail, setDetail] = useState<LoadedDetail | null>(null);
  const [comparison, setComparison] = useState<LoadedComparison | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(() => Boolean(selectedAddressKey));
  const [isComparisonLoading, setIsComparisonLoading] = useState(() => Boolean(selectedAddressKey));

  useEffect(() => {
    if (!selectedAddressKey) return;
    let isMounted = true;
    void fetchAddressDetail(selectedAddressKey).then((d)=>{ if(isMounted) setDetail({addressKey:selectedAddressKey,data:d});}).catch(()=>{if(isMounted) setDetail({addressKey:selectedAddressKey,data:null});}).finally(()=>{if(isMounted) setIsDetailLoading(false);});
    return ()=>{isMounted=false;};
  }, [selectedAddressKey]);

  useEffect(() => {
    if (!selectedAddressKey) return;
    let isMounted = true;
    void fetchComparisonArtifact(selectedAddressKey).then((c)=>{ if(isMounted) setComparison({addressKey:selectedAddressKey,data:c});}).catch(()=>{if(isMounted) setComparison({addressKey:selectedAddressKey,data:null});}).finally(()=>{if(isMounted) setIsComparisonLoading(false);});
    return ()=>{isMounted=false;};
  }, [selectedAddressKey]);

  return { detail, comparison, isDetailLoading, isComparisonLoading, setDetail, setComparison, setIsDetailLoading, setIsComparisonLoading };
}
