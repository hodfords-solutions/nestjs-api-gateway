/*This Lua script enforces rate limiting by managing a counter in Redis.
- If the counter is below the limit, it allows the operation and increments the counter.
- If the counter has reached the limit, it returns the remaining TTL to indicate when the limit will reset.
- If the key does not exist, it initializes it with a count of 1 and sets an expiration time.
*/
export const LUA_INCREASE_AND_GET_SCRIPT = `
local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local expire_time = ARGV[2]

    local current = tonumber(redis.call('get', key) or "0")
    if current > 0 then
     if current >= limit then
     return redis.call("PTTL",key)
     else
            redis.call("INCR", key)
     return 0
     end
    else
        redis.call("SET", key, 1,"px",expire_time)
     return 0
    end
`;
