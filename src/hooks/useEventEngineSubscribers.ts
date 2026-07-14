import { useEffect } from "react";
import { onCollectionEvent, CollectionEvent } from "../lib/eventBus";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { SchedulingEvent, Estimate } from "../types/domain";

/**
 * Registers the Event Engine's cascade rules. Every collection already
 * auto-emits create/update/delete via useFirestoreCollection, so adding a
 * new cascade later is just another onCollectionEvent subscription here —
 * no other file needs to change.
 */
export function useEventEngineSubscribers(): void {
  const { estimates, setCompletedJobsRevenue } = useDomainData();
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
          setCompletedJobsRevenue((prev) => prev + estimate.amount);
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
