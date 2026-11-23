using GMind.Application.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GMind.API.Realtime;

/// <summary>Server-push-only hub: new notifications to their recipient, ids-only "changed" to group members.</summary>
[Authorize]
public sealed class RealtimeHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var sid = Context.User?.FindFirst(TokenService.SessionIdClaim)?.Value;
        if (!string.IsNullOrEmpty(sid))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"session:{sid}");
        await base.OnConnectedAsync();
    }
}
