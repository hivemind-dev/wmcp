#!/usr/bin/env bash
set -euo pipefail

PKG_NAME="@aurorah/wmcp"
PKG_VERSION=$(node -p "require('./package.json').version")

usage() {
  cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  deploy.sh — Build, publish, and install ${PKG_NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USAGE:
  ./deploy.sh <command>

COMMANDS:
  build      Compile TypeScript sources into dist/.
             Runs "npm run build" (tsc) to generate
             JavaScript files and type declarations.

             Output:
               dist/index.js       — compiled ESM entry
               dist/index.d.ts     — TypeScript declarations
               dist/**/*.js        — all compiled modules
               dist/**/*.d.ts      — all declaration files

  login      Log in to the npm registry.
             Opens a browser for authentication.
             Required before publishing.

  publish    Publish the package to the npm registry.
             Automatically runs "build" before publishing.
             Prompts for login if not authenticated.

             On first publish, uses --access public
             since scoped packages default to private.

             To bump version before publishing:
               npm version patch   (0.1.0 -> 0.1.1)
               npm version minor   (0.1.0 -> 0.2.0)
               npm version major   (0.1.0 -> 1.0.0)

  preview    Preview what files will be included in
             the published package (dry run of npm pack).
             Useful for verifying only dist/ is shipped.

  install    Install the published package from npm.
             Useful for verifying the package works
             after publishing. Installs into the
             current project's node_modules.

EXAMPLES:
  ./deploy.sh build        # compile to dist/
  ./deploy.sh preview      # list files in package
  ./deploy.sh login        # log in to npm
  ./deploy.sh publish      # login + build + publish to npm
  ./deploy.sh install      # install from npm registry

PREREQUISITES:
  - Node.js >= 18
  - npm login (for publish)
  - @aurorah org on npmjs.com (for publish)

CURRENT VERSION: ${PKG_VERSION}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
  exit 0
}

cmd_build() {
  echo "=> Building ${PKG_NAME}@${PKG_VERSION} ..."
  npm run build
  echo ""
  echo "=> Build complete. Output in dist/"
  ls -la dist/
}

cmd_publish() {
  echo "=> Publishing ${PKG_NAME}@${PKG_VERSION} to npm ..."
  echo ""

  if ! npm whoami &>/dev/null; then
    echo "   Not logged in to npm. Logging in now..."
    echo ""
    npm login
    echo ""
  fi

  echo "   Logged in as: $(npm whoami)"
  echo ""

  npm publish --access public

  echo ""
  echo "=> Published ${PKG_NAME}@${PKG_VERSION}"
  echo "   Install with: npm install ${PKG_NAME}"
}

cmd_login() {
  echo "=> Logging in to npm ..."
  npm login
  echo ""
  echo "=> Logged in as: $(npm whoami)"
}

cmd_preview() {
  echo "=> Files that would be included in ${PKG_NAME}@${PKG_VERSION}:"
  echo ""
  npm pack --dry-run
}

cmd_install() {
  echo "=> Installing ${PKG_NAME} from npm registry ..."
  npm install "${PKG_NAME}"
  echo ""
  echo "=> Installed ${PKG_NAME}"
}

if [[ $# -eq 0 ]]; then
  usage
fi

case "$1" in
  build)    cmd_build ;;
  preview)  cmd_preview ;;
  login)    cmd_login ;;
  publish)  cmd_publish ;;
  install)  cmd_install ;;
  -h|--help|help) usage ;;
  *)
    echo "ERROR: Unknown command '$1'"
    echo ""
    echo "Run './deploy.sh --help' for usage."
    exit 1
    ;;
esac
