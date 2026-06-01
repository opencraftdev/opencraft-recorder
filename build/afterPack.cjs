// Ad-hoc codesign the packaged macOS app. Without an Apple Developer ID we can't
// notarize, but an ad-hoc signature is enough to turn Gatekeeper's hard
// "is damaged and can't be opened" block (unsigned arm64 binary) into the softer
// "unidentified developer" prompt, which the user can bypass with right-click →
// Open. Runs after electron-builder packs the .app, before the .dmg is built.
const { execSync } = require("node:child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;
  console.log(`Ad-hoc signing ${appPath}`);
  execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: "inherit" });
};
