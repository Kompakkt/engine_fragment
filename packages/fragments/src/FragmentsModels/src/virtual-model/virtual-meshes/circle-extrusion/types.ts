import * as THREE from "../../../../../headless/math";
import { AxisPartClass } from "../../../../../Schema";

export interface LinkPoint {
  placement: THREE.Vector3;
  axisClass: AxisPartClass;
  first?: boolean;
  last?: boolean;
}
