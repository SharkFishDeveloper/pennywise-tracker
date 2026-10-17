"use client";

import { syncRecurrences } from "@/recurrence";
import { useEffect } from "react";

const RecurrenceSync = () => {
  useEffect(() => {
    void syncRecurrences().catch((error) => {
      console.error("Failed to sync recurring expenses:", error);
    });
  }, []);

  return null;
};

export default RecurrenceSync;
