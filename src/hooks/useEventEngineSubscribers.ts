import { useEffect } from "react";
import { onCollectionEvent, CollectionEvent } from "../lib/eventBus";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { SchedulingEvent, Estimate } from "../types/domain";

function generateRevenueEventId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Registers the Event Engine's cascade rules. Every collection already
 * auto-emits create/update/delete via useFirestoreCollection, so adding a
 * new cascade later is just another onCollectionEvent subscription here —
 * no other file needs to change.
 */
export function useEventEngineSubscribers(): void {
  const { estimates, setRevenueEvents } = useDomainData();
  const { logOperationalEvent, triggerNotification } = useNavTelemetry();

  useEffect(() => {
    const unsubscribe = onCollectionEvent("scheduling_events", (evt: CollectionEvent<SchedulingEvent>) => {
      if (evt.type !== "updated") return;
      const { item, previous } = evt;
      const justCompleted = previous?.status !== "Completed" && item.status === "Completed";
      if (!justCompleted || item.eventType !== "Job") return;

      if (item.sourceEstimateId) {
        const estimate = estimates.find((e: Estimate) => e.id === item.sourceEstimateId);
        if (estimate) {
          setRevenueEvents((prev) => [
            ...prev,
            {
              id: generateRevenueEventId(),
              date: new Date().toISOString(),
              amount: estimate.amount,
              customer: item.customer,
              jobId: item.id,
              estimateId: estimate.id
            }
          ]);
          logOperationalEvent("Job Completed", `${item.customer}'s job completed — $${estimate.amount.toLocaleString()} revenue recognized`, "💰");
          triggerNotification(`Job completed for ${item.customer}: $${estimate.amount.toLocaleString()} revenue recognized`);
          return;
        }
      }

      logOperationalEvent("Job Completed", `${item.customer}'s job marked completed`, "✅");
      triggerNotification(`Job completed for ${item.customer}`);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates]);
}
