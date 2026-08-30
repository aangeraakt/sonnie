const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

class Logger {
  static timestamp() {
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  static info(message) {
    console.log(`${colors.cyan}[INFO] [${this.timestamp()}]${colors.reset} ${message}`);
  }

  static success(message) {
    console.log(`${colors.green}[SUCCESS] [${this.timestamp()}]${colors.reset} ${message}`);
  }

  static warn(message) {
    console.warn(`${colors.yellow}[WARN] [${this.timestamp()}]${colors.reset} ${message}`);
  }

  static error(message, err = "") {
    console.error(`${colors.red}[ERROR] [${this.timestamp()}]${colors.reset} ${message}`, err);
  }
}

module.exports = Logger;
