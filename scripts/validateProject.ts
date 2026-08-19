import { summarizeTimelineIssues } from "../src/domain/timelineValidation";
import { validateProjectDirectory } from "./projectValidation";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const projectDirectory = args.find((argument) => !argument.startsWith("--"));

if (!projectDirectory) {
  console.error("Usage: npm run validate:project -- projects/<project-id> [--strict]");
  process.exitCode = 1;
} else {
  try {
    const result = validateProjectDirectory(projectDirectory, { strict });
    const warnings = result.issues.filter((issue) => issue.severity === "warning");
    if (warnings.length > 0) {
      console.log(`Timeline check for "${result.project.id}":`);
      for (const line of summarizeTimelineIssues(warnings)) console.log(`  ${line}`);
    }
    const warningNote =
      warnings.length > 0 ? ` (${warnings.length} gap warning(s))` : "";
    console.log(
      `Project "${result.project.id}" is valid: ${result.scenes.length} scene(s) checked${warningNote}.`,
    );
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
