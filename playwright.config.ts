import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir:'./tests',fullyParallel:true,retries:process.env.CI?1:0,workers:2,
  timeout:30000,expect:{timeout:10000},
  use:{baseURL:'http://127.0.0.1:8795',channel:process.env.PLAYWRIGHT_CHANNEL??'chrome',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter:process.env.CI?'github':'list',
})
