"use client";

import * as React from "react";
import { fetchEncrypted } from "@/lib/cipher";

export type DropdownOptions = {
  faPersons: string[];
  faCompanies: string[];
  underwriters: string[];
};

const EMPTY: DropdownOptions = {
  faPersons: [],
  faCompanies: [],
  underwriters: [],
};

let cached: DropdownOptions | null = null;
let inflight: Promise<DropdownOptions> | null = null;
let loaded = false;

export function preloadDropdownOptions(): Promise<DropdownOptions> {
  if (loaded) return Promise.resolve(cached ?? EMPTY);

  if (!inflight) {
    inflight = fetchEncrypted<DropdownOptions>("/api/dropdown-options")
      .then((data) => {
        cached = data;
        return data;
      })
      .catch(() => {
        cached = EMPTY;
        return EMPTY;
      })
      .finally(() => {
        loaded = true;
        inflight = null;
      });
  }

  return inflight;
}

export function useDropdownOptions(): DropdownOptions {
  const [options, setOptions] = React.useState<DropdownOptions>(
    cached ?? EMPTY,
  );

  React.useEffect(() => {
    let active = true;
    preloadDropdownOptions().then((data) => {
      if (active) setOptions(data);
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
}
