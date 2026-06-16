import React, { useEffect, useState } from "react";
import { useSigma } from "@react-sigma/core";
import { safeOn, safeOff } from "../lib/sigmaEvents";

export function DebugOverlay() {
  const sigma = useSigma();
  const [tier, setTier] = useState<string>("");
  const [liveCount, setLiveCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const ratio = sigma.getCamera().ratio;
      const tierName =
        ratio > 0.8 ? "overview" : ratio > 0.2 ? "mid" : "detail";
      setTier(tierName);
      const g = sigma.getGraph();
      setLiveCount(g.order);
      let vc = 0;
      g.forEachNode((id) => {
        if (g.getNodeAttribute(id, "visible") !== false) vc++;
      });
      setVisibleCount(vc);
    };

    const camera = sigma.getCamera();
    safeOn(camera, "updated", update);
    update();
    return () => safeOff(camera, "updated", update);
  }, [sigma]);

  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        zIndex: 60,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.6)",
        color: "white",
        fontSize: 12,
        pointerEvents: "auto",
      }}
    >
      <div>Tier: {tier}</div>
      <div>Live nodes: {liveCount.toLocaleString()}</div>
      <div>Visible: {visibleCount.toLocaleString()}</div>
    </div>
  );
}
