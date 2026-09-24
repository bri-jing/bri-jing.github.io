import VisualSceneGuide from "../../components/VisualSceneGuide";
import { visualGuides } from "../../data/visual-guides";

export default function ScenePage() {
  return <VisualSceneGuide guide={visualGuides["nanping-wanzhong"]} />;
}
