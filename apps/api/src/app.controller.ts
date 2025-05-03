import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Controller()
export class AppController {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  @Get('cache-test')
  async testCache() {
    await this.cacheManager.set('foo', 'bar');

    const val = await this.cacheManager.get('foo');

    return { foo: val };
  }
}
