import type { NcmCliService } from './ncm-cli-service'

// ==================== 内置网易云 API 凭证 ====================
//
// 凭证以内置常量的形式打包进应用（asar 内），用户不可修改。
// 应用启动时由 ensureBuiltinCredentials 自动写入 ncm-cli 本地配置。
//
// 已知取舍：凭证明文存在于应用包内可被提取。该凭证仅用于 API 限流下的
// 数据查询（同步、搜索、热评等），非个人机密，属于"开箱即用"的固定配置。

/** 内置网易云开放平台 App ID */
export const BUILTIN_NCM_APP_ID = 'b3010d0000000000a933aedcc6430d31'

/** 内置网易云开放平台 Private Key（单行字符串，与 config set 写入格式一致，不含换行） */
export const BUILTIN_NCM_PRIVATE_KEY =
  'MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCaA/vvmIA3HYh+S3geCP5Uc9dt1frDAaK2nur2yktuFIYH4SbXBZKimB8NOj6AheS+eMZbsWvQ2Gfpzm6rm8CizP2DmYcL2vDtlb+C1omEKiAhIZ6A1ikKHKNUYX/FfE1L+zAHM8XCPqyXPTYOoJCJYUs2DSuIAo7PCxcLUHj9+mt32Cln9zVGqvKUUPOR3PxPrtVRMkIupjiMZE76F8VaTZ8rMB5sO4Az654hPu3DABjGoa41A7q5gy7C4xqOw0lFgcct5fUsgF/oiSx5N0wrRB84Iwomo2snhmK6QjR2MWk09dGFAdW/3zy+mJiKEOmx75YRdG9YatS+n6EtroQLAgMBAAECggEAAj74oLazwRoBcGqfnYUVxPc6W5iLh+YxWYtHKnmYLAFbeLqEG1cyUjr4iPP9WDQt8OyRY2IRjCZpdqqJ/8PNae3KyBHxX6YHJNj3DtpAWyHn2OYgUwk6MbKy7ejxgg94j/SGFDTPEueFXDvTbSBS39ckz6OMYq3yTFal66rj5oTQjwFIwGrMNrUnBMRKg3qDdwTRvmQEwLdkfWacMG3lRe10oLwa297BUccJNvmA1D+Roe+BVT8SCTggclwrpMhOy+xT8Kc3TWqQB3CQZz34FsKqWFP/WmnJEmmDP0KWMsJrpbeAQ+b4D+pCizmORawO5ndYW2FssEKp50dwCAHHIQKBgQC5npwcCF0R5HZtOycOEdIIAojOSsSIdWO7HbdF7ztVK4oOr0vbyducEKo4d7iaykq/rl0DkCnbeFesiC6dnJ3o5Mq9CT+KZZmgiz+NNROTmwCmQboJ3KmhspPHt1w4YlQmCY+h8Jgqk1NRO/T4rwDamL2YFv6KIg3oOL2R9yvneQKBgQDUabFdWl2V2um+7A+IWIG1hGe3pK8pCLzZDvIZwQ+3yZ9yDLlIEyIeAaOg0ZaZ+71W2uQMoiQSJbpUo4qzVaaZVRZIQQo6FhJdyQn9TLAbZpTCeTA5Hm4ZwzyM4B7qpny5EZs6OXfWLYgfnRe0krpXvXGtCuWdIH7IpQ4Y2giyowKBgFXIx7zs4JZ0T4cL33DRK5AoG7G7PDkUh5LimODpPzKNfLBss1JQZ/4odYLDUb233/PWUYZkCfQ0GdDS3zhYOWJ42nmi3IrJicZ4lFZeQT3mVNaBaclFAeCI92NFiolEaD9sC8V7u9dxXwAcBYso1ewwyu6PMfQE6Qh5sKLU6KWBAoGAdoLlz3T8pAB4y+n/HI5tCC5wg7ihdd6HJv+8ufvKXjti94n70ifCsEUv2yk0woL+97e25wmL4IgmNtTsLPSLuB8OCJApOZFY+/SP20BvPUp1ky90ZVoCCeOxI9Rjy33KNqOJHOo1X00WFrVaJYh76Tosc2SSCaG4uw/EFr+HfMsCgYAHOKWkqSfKZbjvoPiB1LKRvQ+xYnEw1HK+nejZFaQBIg4StKJHJO/62I40nRt2WEdfZSZ/uN3IRw/X6uGzwP5DhQYrcB4uzC04qUlz5W2259jjzOROhEIa7XqZR74LWaG4+hweK4MvyLKjiFicTY+Nkc1+h72+UWUQZmHYsJlvCA=='

/**
 * 确保 ncm-cli 使用内置凭证（应用启动时调用一次）
 *
 * 读回本地配置状态：已配置且 appId 与内置值一致则跳过（幂等）；
 * 未配置、被改动或无法解析出 appId 时，以非交互方式重写为内置值。
 * 失败抛给调用方处理（仅记日志，不阻断启动）。
 */
export async function ensureBuiltinCredentials(service: NcmCliService): Promise<void> {
  const status = await service.getCredentialConfigStatus()
  if (status.configured && status.appId === BUILTIN_NCM_APP_ID) {
    console.log('[ncm-cli] 内置凭证已就绪，跳过写入')
    return
  }
  console.log('[ncm-cli] 写入内置网易云 API 凭证…')
  await service.configureWithCredentials(BUILTIN_NCM_APP_ID, BUILTIN_NCM_PRIVATE_KEY)
  console.log('[ncm-cli] 内置凭证写入完成')
}
