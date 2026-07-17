import {
  buildPilotOperationalMetrics,
  buildPilotStabilityMetrics,
} from './pilotOperationalMetrics.mjs';
import {
  buildPilotInputChangeMetrics,
  buildPilotRailMetrics,
} from './pilotRailMetrics.mjs';
import {
  buildPilotBoundaryContinuity,
  buildPilotResidenceMetrics,
} from './pilotContinuityMetrics.mjs';

export function buildTopStoriesPilotMetrics(days = []) {
  const ordered = [...days].sort((left, right) => left.date.localeCompare(right.date));
  return {
    operational: buildPilotOperationalMetrics(ordered),
    stability: buildPilotStabilityMetrics(ordered),
    railAndFunnel: buildPilotRailMetrics(ordered),
    inputChange: buildPilotInputChangeMetrics(ordered),
    crossDayBoundary: buildPilotBoundaryContinuity(ordered),
    residence: buildPilotResidenceMetrics(ordered),
  };
}
