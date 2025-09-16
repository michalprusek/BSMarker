/**
 * Simple logger utility for frontend logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, context: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;

    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(formattedMessage, data);
        }
        break;
      case 'info':
        console.info(formattedMessage, data);
        break;
      case 'warn':
        console.warn(formattedMessage, data);
        break;
      case 'error':
        console.error(formattedMessage, data);
        break;
    }
  }

  debug(message: string, context?: string, data?: any): void {
    this.log('debug', message, context || 'Unknown', data);
  }

  info(message: string, context?: string, data?: any): void {
    this.log('info', message, context || 'Unknown', data);
  }

  warn(message: string, context?: string, data?: any): void {
    this.log('warn', message, context || 'Unknown', data);
  }

  error(message: string, context?: string, data?: any): void {
    this.log('error', message, context || 'Unknown', data);
  }
}

export const logger = new Logger();