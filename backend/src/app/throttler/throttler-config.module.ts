import { Global, Module } from '@nestjs/common';
import { ThrottlePolicyResolver } from './throttle-policy.resolver';

/**
 * Global module that registers and exports ThrottlePolicyResolver.
 *
 * Marked @Global() so it is available to ThrottlerModule.forRootAsync()
 * without explicit imports in every feature module.
 */
@Global()
@Module({
  providers: [ThrottlePolicyResolver],
  exports: [ThrottlePolicyResolver],
})
export class ThrottlerConfigModule {}
