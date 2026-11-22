using System.Threading.Channels;
using GMind.Application.Common;
using Microsoft.Extensions.Logging;

namespace GMind.Infrastructure.Persistence;

/// <summary>Singleton bounded channel between the SaveChanges interceptor and the dispatcher. Drops oldest when full.</summary>
public sealed class RealtimeOutbox
{
    private const int Capacity = 256;
    private readonly Channel<RealtimeBatch> _channel = Channel.CreateBounded<RealtimeBatch>(
        new BoundedChannelOptions(Capacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });
    private readonly ILogger<RealtimeOutbox> _logger;

    public RealtimeOutbox(ILogger<RealtimeOutbox> logger) => _logger = logger;

    public ChannelReader<RealtimeBatch> Reader => _channel.Reader;

    public void Enqueue(RealtimeBatch batch)
    {
        if (_channel.Reader.Count >= Capacity)
            _logger.LogWarning("Realtime outbox full ({Capacity}); dropping oldest batch", Capacity);
        if (!_channel.Writer.TryWrite(batch))
            _logger.LogWarning("Realtime outbox closed; batch of {Count} notification(s) dropped", batch.Notifications.Count);
    }
}
