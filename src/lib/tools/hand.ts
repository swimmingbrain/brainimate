import { toolBase, type Tool } from './tool';

// the stage pans for the hand tool itself, the same way it does for space and the middle button
export const handTool: Tool = { ...toolBase('hand') };
