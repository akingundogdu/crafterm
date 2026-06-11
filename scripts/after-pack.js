// Code-sign the packaged macOS app. Apple Silicon (arm64) refuses to run an
// unsigned app. When CRAFTERM_SIGN_IDENTITY names a stable signing identity
// (e.g. a self-signed "Code Signing" certificate in the login keychain), macOS
// keeps its privacy (TCC) folder-access grants across rebuilds, because the
// signature's designated requirement stays constant. Without it, fall back to an
// ad-hoc signature ("-"), whose requirement is tied to the binary's cdhash and
// changes every build, forcing macOS to re-prompt for folder access each time.
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const identity = process.env.CRAFTERM_SIGN_IDENTITY || '-'
  const label = identity === '-' ? 'ad-hoc' : `"${identity}"`
  console.log(`  • code-signing ${appPath} with ${label} identity`)
  execSync(`codesign --force --deep --sign "${identity}" "${appPath}"`, { stdio: 'inherit' })
}
