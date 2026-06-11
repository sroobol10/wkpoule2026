"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// De beker op de bergtop: klik = 3 seconden flink uitvergroot, daarna weer normaal.
export function SummitCup() {
  const [big, setBig] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = () => {
    setBig(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBig(false), 3000);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={trigger}
      aria-label="WK-beker"
      className={`relative block cursor-pointer ${big ? "z-50" : ""}`}
    >
      <Image
        src="/pim-cup.png"
        alt="WK-beker"
        width={313}
        height={781}
        className="relative h-12 w-auto sm:h-18 drop-shadow-lg origin-top"
        style={{
          transform: big ? "scale(8)" : "scale(1)",
          transition: "transform 0.9s cubic-bezier(0.34, 1.3, 0.64, 1)",
        }}
      />
    </button>
  );
}
